const ver = 0.00,
    API_HOST = '127.0.0.1',
    API_PORT_SEND = 6310,
    API_PORT_LISTEN = 6311,
    API_FILE = 'face-detect-api.pyw',
    SD_INIT_DELAY = 9000, // максимальное время ожидания ответа Stable Diffusion при запросе текущих параметров
    SD_RELOAD_CHECKPOINT_DELAY = 10000, // максимальное время ожидания перезагрузки checkpoint или vae
    SD_GENERATION_DELAY = 80000; // максимальное время ожидания генерации изображения

var fd = new faceApi(API_HOST, API_PORT_SEND, API_PORT_LISTEN, new File((new File($.fileName)).path + '/' + API_FILE)),
    s2t = stringIDToTypeID,
    t2s = typeIDToStringID,
    str = new Locale(),
    apl = new AM('application'),
    doc = new AM('document'),
    lr = new AM('layer');


if (fd.init()) {
    var f = new File(Folder.temp + '/FD.jpg');
    doc.saveACopy(f);

    var result = fd.sendPayload(f.fsName.replace(/\\/g, '\\\\'));
    if (result) {
        fd.exit()
     //   $.writeln(result.toSource())
      /*  doc.addCounter(result[263][0], result[263][1])
        doc.addCounter(result[33][0], result[33][1])
        doc.addCounter(result[1][0], result[1][1])
        doc.addCounter(result[152][0], result[152][1])*/
        for (a in result) {
            doc.addCounter(result[a][0], result[a][1])
        }
    }
}

function main(selection) {
    var checkpoint = (cfg.sd_model_checkpoint == API['sd_model_checkpoint'] ? null : findOption(cfg.sd_model_checkpoint, API['sd-models'], API['sd_model_checkpoint'])),
        vae = (cfg.current.sd_vae == API['sd_vae'] ? null : findOption(cfg.current.sd_vae, API['sd-vaes'], API['sd_vae'])),
        encoders = checkEncoders(cfg.current.encoders, API['forge_additional_modules'], API['sd_modules']),
        memory = cfg.control_memory ? (API['forge_inference_memory'] == cfg.forge_inference_memory ? null : cfg.forge_inference_memory) : (API['forge_inference_memory'] == cfg.forge_inference_memory_default ? null : cfg.forge_inference_memory_default);
    if (checkpoint != cfg.sd_model_checkpoint && checkpoint != null) cfg.sd_model_checkpoint = checkpoint
    if (selection.previousGeneration) doc.hideSelectedLayers()
    if (doc.getProperty('quickMask')) {
        doc.quickMask('clearEvent');
        doc.makeLayer(LAYER_NAME)
        doc.makeSelectionMask()
    } else if (doc.hasProperty('selection')) {
        doc.makeLayer(LAYER_NAME)
        doc.makeSelectionMask()
    } else if (lr.getProperty('name') == LAYER_NAME) {
        if (lr.getProperty('hasUserMask')) {
            lr.selectChannel('mask')
            doc.makeSelectionFromLayer('targetEnum');
        } else {
            doc.makeSelectionFromLayer('transparencyEnum');
            doc.makeSelectionMask()
        }
    }
    selection.junk = lr.getProperty('layerID')
    doc.makeSelection(selection.bounds);
    var hst = activeDocument.activeHistoryState,
        c = doc.getProperty('center').value;
    doc.crop(true);
    if (cfg.flatten) { doc.flatten() } else {
        var len = doc.getProperty('numberOfLayers'),
            start = lr.getProperty('itemIndex'),
            lrsList = new ActionReference();
        offset = doc.getProperty('hasBackgroundLayer') ? 0 : 1;
        for (var i = start + offset; i <= len; i++) lrsList.putIdentifier(s2t('layer'), lr.getProperty('layerID', false, i, true));
        if (start + offset <= len) {
            doc.selectLayersByIDList(lrsList);
            doc.hideSelectedLayers();
        }
    }
    var f = new File(Folder.temp + '/SDH.jpg');
    var f1 = new File(Folder.temp + '/SDH_MASK.jpg');
    doc.saveACopy(f);
    if (cfg.current.inpaintingFill != -1) {
        lr.selectChannel('mask');
        lr.selectAllPixels();
        doc.copyPixels()
        lr.selectChannel('RGB')
        doc.pastePixels()
        doc.saveACopy(f1);
    }
    activeDocument.activeHistoryState = hst;
    doc.setProperty('center', c);
    var p = (new Folder(Folder.temp + '/outputs/img2img-images'))
    if (!p.exists) p.create()
    if (checkpoint || (cfg.sd_model_checkpoint.toLocaleUpperCase().indexOf('FLUX') == -1 && cfg.sd_model_checkpoint.toLocaleUpperCase().indexOf('KONTEXT') == -1 ? vae : encoders) || memory) {
        var vae_path = [];
        if (API.forgeUI) {
            if (cfg.sd_model_checkpoint.toLocaleUpperCase().indexOf('FLUX') == -1 && cfg.sd_model_checkpoint.toLocaleUpperCase().indexOf('KONTEXT') == -1) {
                for (var i = 0; i < API['sd_modules'].length; i++) {
                    if (API['sd_modules'][i].indexOf(cfg.current.sd_vae) != -1) {
                        vae_path.push(API['sd_modules'][i])
                        break;
                    }
                }
            } else vae_path = encoders
        }
        if (!API.setOptions(checkpoint, vae, vae_path, memory)) throw new Error(str.errUpdating)
    }
    if (cfg.autoResize && !isDitry) cfg.current.resize = autoScale(selection.bounds)
    var width = cfg.current.resize != 1 ? (mathTrunc((selection.bounds.width * cfg.current.resize) / 8) * 8) : selection.bounds.width,
        height = cfg.current.resize != 1 ? (mathTrunc((selection.bounds.height * cfg.current.resize) / 8) * 8) : selection.bounds.height
    var payload = {
        'input': f.fsName.replace(/\\/g, '\\\\'),
        'output': p.fsName.replace(/\\/g, '\\\\'),
        'prompt': cfg.current.prompt.toString().replace(/[^A-Za-z0-9.,()\-<>: ]/g, ''),
        'negative_prompt': cfg.sd_model_checkpoint.toLocaleUpperCase().indexOf('FLUX') == -1 && cfg.sd_model_checkpoint.toLocaleUpperCase().indexOf('KONTEXT') == -1 ? cfg.current.negative_prompt.toString().replace(/[^A-Za-z0-9.,()\-<>: ]/g, '') : '',
        'sampler_name': cfg.current.sampler_name,
        'scheduler': cfg.current.scheduler,
        'cfg_scale': cfg.current.cfg_scale,
        'seed': -1,
        'steps': cfg.current.steps,
        'width': width,
        'height': height,
        'denoising_strength': cfg.current.denoising_strength,
        'n_iter': 1,
    };
    if (cfg.sd_model_checkpoint.toLocaleUpperCase().indexOf('FLUX') != -1 || cfg.sd_model_checkpoint.toLocaleUpperCase().indexOf('KONTEXT') != -1) payload['flux'] = true;
    if (cfg.sd_model_checkpoint.toLocaleUpperCase().indexOf('KONTEXT') != -1 && API.extensions[FLUX_KONTEXT]) {
        payload['kontext'] = true
        if (cfg.current.reference != '') {
            var r = new File(cfg.current.reference)
            if (r.exists) payload['reference'] = r.fsName.replace(/\\/g, '\\\\')
        }
    };
    if (API.extensions[FLUX_CACHE] && cfg.forge_control_cache && cfg.current.forge_cache > 0) payload['cache'] = cfg.current.forge_cache;
    if (cfg.current.inpaintingFill != -1) {
        payload['mask'] = f1.fsName.replace(/\\/g, '\\\\')
        payload['inpainting_fill'] = cfg.current.inpaintingFill + 1
    }
    apl.waitForRedraw()
    var result = API.sendPayload(payload);
    if (result) {
        activeDocument.suspendHistory('Generate image', 'generatedImageToLayer()')
    } else throw new Error(str.errGenerating)
    function generatedImageToLayer() {
        doc.place(new File(result))
        var placedBounds = doc.descToObject(lr.getProperty('bounds').value);
        var dW = (selection.bounds.right - selection.bounds.left) / (placedBounds.right - placedBounds.left);
        var dH = (selection.bounds.bottom - selection.bounds.top) / (placedBounds.bottom - placedBounds.top)
        lr.transform(dW * 100, dH * 100);
        if (cfg.rasterizeImage) { try { lr.rasterize() } catch (e) { } }
        lr.setName(LAYER_NAME)
        doc.makeSelectionFromLayer('mask', selection.junk)
        doc.makeSelectionMask()
        doc.deleteLayer(selection.junk)
        lr.selectChannel('mask');
        if (cfg.selectBrush) {
            doc.resetSwatches()
            doc.selectBrush();
            doc.setBrushOpacity(cfg.brushOpacity)
        }
        (new File(result)).remove();
    }
}
function faceApi(apiHost, portSend, portListen, apiFile) {
    this.init = function () {
        if (!apiFile.exists) return false
        apiFile.execute();
        var result = sendMessage({}, SD_INIT_DELAY, false, true);
        if (!result) return false
        //    $.writeln(result.toSource())
        return true
    }
    this.exit = function () {
        sendMessage({ type: 'exit' }, SD_INIT_DELAY, true, false)
    }
    this.sendPayload = function (payload) {
        var result = sendMessage({ type: 'payload', message: payload }, SD_RELOAD_CHECKPOINT_DELAY, true, true)
        if (result) return result['message']
        return null;
    }
    function checkConnecton(host) {
        var socket = new Socket,
            answer = socket.open(host);
        socket.close()
        return answer
    }
    function sendMessage(o, delay, sendData, getData) {
        var tcp = new Socket,
            delay = delay ? delay : SD_INIT_DELAY;
        if (sendData) {
            tcp.open(apiHost + ':' + portSend, 'UTF-8')
            tcp.writeln(objectToJSON(o))
            tcp.close()
        }
        if (getData) {
            var tcp = new Socket,
                t1 = (new Date).getTime(),
                t2 = 0;
            if (tcp.listen(portListen, 'UTF-8')) {
                for (; ;) {
                    t2 = (new Date).getTime();
                    if (t2 - t1 > delay) {
                        $.writeln(delay)
                        return null;
                    }
                    var answer = tcp.poll();
                    if (answer != null) {
                        var a = eval('(' + answer.readln() + ')');
                        answer.close();
                        return a;
                    }
                }
            }
            tcp.close()
        }
        return null
    }

    function objectToJSON(obj) {
        if (obj === null) {
            return 'null';
        }
        if (typeof obj !== 'object') {
            return '"' + obj + '"';
        }
        if (obj instanceof Array) {
            var arr = [];
            for (var i = 0; i < obj.length; i++) {
                arr.push(objectToJSON(obj[i]));
            }
            return '[' + arr.join(',') + ']';
        }
        var keys = [];
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                keys.push(key);
            }
        }
        var result = [];
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var value = objectToJSON(obj[key]);
            result.push('"' + key + '":' + value);
        }
        return '{' + result.join(',') + '}';
    }
}
function AM(target, order) {
    var s2t = stringIDToTypeID,
        t2s = typeIDToStringID,
        AR = ActionReference,
        AD = ActionDescriptor,
        AL = ActionList;
    target = target ? s2t(target) : null;
    this.getProperty = function (property, descMode, id, idxMode) {
        property = s2t(property);
        (r = new AR).putProperty(s2t('property'), property);
        id != undefined ? (idxMode ? r.putIndex(target, id) : r.putIdentifier(target, id)) :
            r.putEnumerated(target, s2t('ordinal'), order ? s2t(order) : s2t('targetEnum'));
        return descMode ? executeActionGet(r) : getDescValue(executeActionGet(r), property);
    }
    this.hasProperty = function (property, id, idxMode) {
        property = s2t(property);
        (r = new AR).putProperty(s2t('property'), property);
        id ? (idxMode ? r.putIndex(target, id) : r.putIdentifier(target, id))
            : r.putEnumerated(target, s2t('ordinal'), s2t('targetEnum'));
        try { return executeActionGet(r).hasKey(property) } catch (e) { return false }
    }
    this.setProperty = function (property, desc) {
        property = s2t(property);
        (r = new AR).putProperty(s2t('property'), property);
        r.putEnumerated(target, s2t('ordinal'), s2t('targetEnum'));
        (d = new ActionDescriptor).putReference(s2t('null'), r);
        d.putObject(s2t('to'), property, desc);
        executeAction(s2t('set'), d, DialogModes.NO);
    }
    this.descToObject = function (d) {
        var o = {}
        for (var i = 0; i < d.count; i++) {
            var k = d.getKey(i)
            o[t2s(k)] = getDescValue(d, k)
        }
        return o
    }
    this.flatten = function () { executeAction(s2t('flattenImage'), undefined, DialogModes.NO); }
    this.saveACopy = function (pth) {
        (d1 = new AD).putInteger(s2t('extendedQuality'), 12);
        d1.putEnumerated(s2t('matteColor'), s2t('matteColor'), s2t('none'));
        (d = new AD).putObject(s2t('as'), s2t('JPEG'), d1);
        d.putPath(s2t('in'), pth);
        d.putBoolean(s2t('copy'), true);
        executeAction(s2t('save'), d, DialogModes.NO);
    }
    this.makeSelection = function (bounds, addTo) {
        (r = new AR).putProperty(s2t('channel'), s2t('selection'));
        (d = new AD).putReference(s2t('null'), r);
        (d1 = new AD).putUnitDouble(s2t('top'), s2t('pixelsUnit'), bounds.top);
        d1.putUnitDouble(s2t('left'), s2t('pixelsUnit'), bounds.left);
        d1.putUnitDouble(s2t('bottom'), s2t('pixelsUnit'), bounds.bottom);
        d1.putUnitDouble(s2t('right'), s2t('pixelsUnit'), bounds.right);
        d.putObject(s2t('to'), s2t('rectangle'), d1);
        executeAction(s2t(addTo ? 'addTo' : 'set'), d, DialogModes.NO);
    }
    this.deleteLayer = function (id) {
        (r = new AR).putIdentifier(s2t('layer'), id);
        (d = new AD).putReference(s2t('null'), r);
        executeAction(s2t('delete'), d, DialogModes.NO);
    }
    this.makeSelectionFromLayer = function (targetEnum, id) {
        (r = new AR).putProperty(s2t('channel'), s2t('selection'));
        (d = new AD).putReference(s2t('null'), r);
        (r1 = new AR).putEnumerated(s2t('channel'), s2t('channel'), s2t(targetEnum));
        if (id) r1.putIdentifier(s2t('layer'), id);
        d.putReference(s2t('to'), r1);
        executeAction(s2t('set'), d, DialogModes.NO);
    }
    this.deselect = function () {
        (r = new AR).putProperty(s2t('channel'), s2t('selection'));
        (d = new AD).putReference(s2t('null'), r);
        d.putEnumerated(s2t('to'), s2t('ordinal'), s2t('none'));
        executeAction(s2t('set'), d, DialogModes.NO);
    }
    this.selectBrush = function () {
        (r = new AR).putClass(s2t('paintbrushTool'));
        (d = new AD).putReference(s2t('null'), r);
        executeAction(s2t('select'), d, DialogModes.NO);
    }
    this.setBrushOpacity = function (opacity) {
        (r = new AR).putProperty(s2t('property'), p = s2t('currentToolOptions'));
        r.putEnumerated(s2t('application'), s2t('ordinal'), s2t('targetEnum'));
        var tool = executeActionGet(r).getObjectValue(p);
        tool.putInteger(s2t('opacity'), opacity);
        (r = new AR).putClass(s2t(currentTool));
        (d = new AD).putReference(s2t('target'), r);
        d.putObject(s2t('to'), s2t('target'), tool);
        executeAction(s2t('set'), d, DialogModes.NO);
    }
    this.resetSwatches = function () {
        (r = new AR).putProperty(s2t('color'), s2t('colors'));
        (d = new AD).putReference(s2t('null'), r);
        executeAction(s2t('reset'), d, DialogModes.NO);
    }
    this.selectChannel = function (channel) {
        (r = new AR).putEnumerated(s2t('channel'), s2t('channel'), s2t(channel));
        (d = new AD).putReference(s2t('null'), r);
        executeAction(s2t('select'), d, DialogModes.NO);
    }
    this.quickMask = function (evt) {
        (r = new AR).putProperty(s2t('property'), s2t('quickMask'));
        r.putEnumerated(s2t('document'), s2t('ordinal'), s2t('targetEnum'));
        (d = new AD).putReference(s2t('null'), r);
        executeAction(s2t(evt), d, DialogModes.NO);
    }
    this.crop = function (deletePixels) {
        (d = new AD).putBoolean(s2t('delete'), deletePixels);
        executeAction(s2t('crop'), d, DialogModes.NO);
    }
    this.selectLayersByIDList = function (IDList) {
        (d = new AD).putReference(s2t('null'), IDList)
        executeAction(s2t('select'), d, DialogModes.NO)
    }
    this.hideSelectedLayers = function () {
        (r = new AR).putEnumerated(s2t('layer'), s2t('ordinal'), s2t('targetEnum'));
        (l = new AL).putReference(r);
        (d = new AD).putList(s2t('null'), l);
        executeAction(s2t('hide'), d, DialogModes.NO);
    }
    this.setName = function (title) {
        (r = new AR).putEnumerated(s2t('layer'), s2t('ordinal'), s2t('targetEnum'));
        (d = new AD).putReference(s2t('null'), r);
        (d1 = new AD).putString(s2t('name'), title);
        d.putObject(s2t('to'), s2t('layer'), d1);
        executeAction(s2t('set'), d, DialogModes.NO);
    }
    this.place = function (pth) {
        (d = new AD).putPath(s2t('null'), pth);
        d.putBoolean(s2t('linked'), false);
        executeAction(s2t('placeEvent'), d, DialogModes.NO);
    }
    this.rasterize = function () {
        (d = new AD).putReference(s2t('target'), r);
        executeAction(s2t('rasterizePlaced'), d, DialogModes.NO);
    }
    this.makeSelectionMask = function () {
        (d = new AD).putClass(s2t('new'), s2t('channel'));
        (r = new AR).putEnumerated(s2t('channel'), s2t('channel'), s2t('mask'));
        d.putReference(s2t('at'), r);
        d.putEnumerated(s2t('using'), s2t('userMask'), s2t('revealSelection'));
        executeAction(s2t('make'), d, DialogModes.NO);
    }
    this.transform = function (dw, dh) {
        (d = new AD).putEnumerated(s2t('freeTransformCenterState'), s2t('quadCenterState'), s2t('QCSAverage'));
        (d1 = new AD).putUnitDouble(s2t('horizontal'), s2t('pixelsUnit'), 0);
        d1.putUnitDouble(s2t('vertical'), s2t('pixelsUnit'), 0);
        d.putObject(s2t('offset'), s2t('offset'), d1);
        d.putUnitDouble(s2t('width'), s2t('percentUnit'), dw);
        d.putUnitDouble(s2t('height'), s2t('percentUnit'), dh);
        executeAction(s2t('transform'), d, DialogModes.NO);
    }
    this.makeLayer = function (title) {
        (r = new AR).putClass(s2t('layer'));
        (d = new AD).putReference(s2t('null'), r);
        (d1 = new AD).putString(s2t('name'), title)
        d.putObject(s2t('using'), s2t('layer'), d1);
        executeAction(s2t('make'), d, DialogModes.NO);
    }
    this.selectAllPixels = function () {
        (r = new AR).putProperty(s2t('channel'), s2t('selection'));
        (d = new AD).putReference(s2t('null'), r);
        d.putEnumerated(s2t('to'), s2t('ordinal'), s2t('allEnum'));
        executeAction(s2t('set'), d, DialogModes.NO);
    }
    this.copyPixels = function () {
        (d = new AD).putString(s2t('copyHint'), 'pixels');
        executeAction(s2t('copyEvent'), d, DialogModes.NO);
    }
    this.pastePixels = function () {
        (d = new AD).putEnumerated(s2t('antiAlias'), s2t('antiAliasType'), s2t('antiAliasNone'));
        d.putClass(s2t('as'), s2t('pixel'));
        executeAction(s2t('paste'), d, DialogModes.NO);
    }
    this.waitForRedraw = function () {
        (d = new ActionDescriptor()).putEnumerated(s2t('state'), s2t('state'), s2t('redrawComplete'));
        executeAction(s2t('wait'), d, DialogModes.NO);
    }
    this.addCounter = function (x, y) {
        (d = new ActionDescriptor()).putDouble(s2t("x"), x);
        d.putDouble(s2t("y"), y);
        executeAction(s2t("countAdd"), d, DialogModes.NO);
    }
    function getDescValue(d, p) {
        switch (d.getType(p)) {
            case DescValueType.OBJECTTYPE: return { type: t2s(d.getObjectType(p)), value: d.getObjectValue(p) };
            case DescValueType.LISTTYPE: return d.getList(p);
            case DescValueType.REFERENCETYPE: return d.getReference(p);
            case DescValueType.BOOLEANTYPE: return d.getBoolean(p);
            case DescValueType.STRINGTYPE: return d.getString(p);
            case DescValueType.INTEGERTYPE: return d.getInteger(p);
            case DescValueType.LARGEINTEGERTYPE: return d.getLargeInteger(p);
            case DescValueType.DOUBLETYPE: return d.getDouble(p);
            case DescValueType.ALIASTYPE: return d.getPath(p);
            case DescValueType.CLASSTYPE: return d.getClass(p);
            case DescValueType.UNITDOUBLE: return (d.getUnitDoubleValue(p));
            case DescValueType.ENUMERATEDTYPE: return { type: t2s(d.getEnumerationType(p)), value: t2s(d.getEnumerationValue(p)) };
            default: break;
        };
    }
}

function Locale() {
    this.apply = { ru: 'Применить настройки', en: 'Apply settingsa' }
    this.brush = { ru: 'Настройки кисти', en: 'Brush settings' }
    this.errAnswer = { ru: 'не отвечает!', en: 'not answering!' }
    this.errConnection = { ru: 'Невозможно установить соединение c ', en: 'Impossible to establish a connection with ' }
    this.errGenerating = { ru: 'Превышено время ожидания ответа Stable Diffusion!', en: 'Exceeded time waiting for the response of Stable Diffusion!' }
    this.errSettings = { ru: 'Невозможно получить параметры ', en: 'Impossible to get the settings ' }
    this.errTimeout = { ru: '\nПревышено время ожидания ответа!', en: '\nExceeding the response time!' }
    this.fill = 'Inpainting fill mode'
    this.flatten = { ru: 'Склеивать слои перед генерацией', en: 'Flatten layers before generation' }
    this.generate = { ru: 'Генерация', en: 'Generate' }
    this.module = { ru: 'Модуль sd-webui-api ', en: 'Module sd-webui-api ' }
    this.notFound = { ru: '\nне найден!', en: 'not found!' }
    this.opacity = { ru: 'Непрозрачность кисти', en: 'Brush opacity' }
    this.output = { ru: 'Параметры изображения', en: 'Image settings' }
    this.progressGenerate = { ru: 'Генерация изображения...', en: 'Image generation...' }
    this.rasterize = { ru: 'Растеризовать сгенерированное изображение', en: 'Rasterize generated image' }
    this.remove = { ru: 'Удалить файл изображения после вставки', en: 'Remove image file after placing' }
    this.selctBrush = { ru: 'Активировать кисть после генерации', en: 'Select brush after processing' }
    this.selection = { ru: 'Выделение: ', en: 'Selection: ' }
    this.settings = { ru: 'Настройки скрпта', en: 'Script settings' }
}