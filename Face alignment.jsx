/*<javascriptresource>
<category>alignment</category>
<enableinfo>true</enableinfo>
</javascriptresource>
*/
#target photoshop
const moveMode = true// false - выравнивание центра лиц выключено, true - включено
const transformMode = true // false - масштабирование выключено, true - включено
const rotateMode = true // false - поворот головы выключен, true - включен
const angle_ratio = 0.5 // 0-1 - коэффициент применяемый к углу наклона головы
const global_scale = 0.25 // 0-1 - коэффициент масштабирования для ускорения работы со слоями
const dialog_mode = DialogModes.NO // DialogModes.ALL - интерактивная траснформация, DialogModes.NO - трансформация без участия пользователя
const ver = 0.13,
    API_HOST = '127.0.0.1',
    API_PORT_SEND = 6310,
    API_PORT_LISTEN = 6311,
    API_FILE = 'face-detect-api.pyw',
    INIT_DELAY = 8000,
    INSTALL_DELAY = 150000,
    DETECTION_DELAY = 8000,
    PROGRESS_DELAY = 2500;
var fd = new faceApi(API_HOST, API_PORT_SEND, API_PORT_LISTEN, new File((new File($.fileName)).path + '/' + API_FILE)),
    s2t = stringIDToTypeID,
    t2s = typeIDToStringID,
    apl = new AM('application'),
    doc = new AM('document'),
    lr = new AM('layer'),
    str = new Locale();
$.localize = true
try {
    var targetLayers = getSelectedLayersIDs(),
        len = targetLayers.length;
    if (len > 1 && fd.exit() && fd.init()) {
        var selectedLayers = targetLayers.slice(1);
        app.doForcedProgress("Detect faces", "getFaceBounds(targetLayers)")
        fd.exit()
        if (targetLayers[0] instanceof Object) {
            dialog_mode == DialogModes.ALL ? app.activeDocument.suspendHistory("Face alignment", 'transformLayers(targetLayers, targetLayers.shift())') :
                app.activeDocument.suspendHistory("Face alignment", 'app.doForcedProgress("Align layers", "transformLayers(targetLayers, targetLayers.shift())")');
        }
    } else { throw new Error(str.errLr) }
} catch (e) { alert(e, str.err) }
function getSelectedLayersIDs() {
    if (!apl.getProperty("numberOfDocuments")) throw new Error(str.errDoc)
    var sel = doc.getProperty("targetLayersIDs"),
        len = sel.count,
        output = []
    for (var i = 0; i < len; i++) {
        var id = sel.getReference(i).getIdentifier(),
            kind = lr.getProperty("layerKind", id);
        if (kind == 1 || kind == 5) {
            var locked = lr.descToObject(lr.getProperty("layerLocking", id).value);
            if (lr.getProperty('background', id) || (!locked['protectAll'] && !locked['protectPosition'] && !locked['protectComposite'])) output.push(id)
        }
    }
    return output
}
function getFaceBounds(selectedLayers) {
    app.activeDocument.suspendHistory("Get face bounds", "function blankState () {return}")
    var len = selectedLayers.length
    for (var i = 0; i < len; i++) {
        app.changeProgressText("Get face bounds: " + lr.getProperty("name", selectedLayers[i]))
        lr.selectLayers([selectedLayers[i]])
        var measurement = {};
        measurement['bounds'] = lr.descToObject(lr.getProperty("boundsNoEffects", selectedLayers[i]).value);
        lr.convertToSmartObject()
        lr.editSmartObject()
        doc.setScale(global_scale)
        app.activeDocument.suspendHistory("Measure Face", "measureFace (measurement)")
        doc.close()
        doc.selectPreviousHistoryState()
        if (measurement.middle) selectedLayers[i] = new getAbsoluteBounds(selectedLayers[i], measurement)
    }
    function measureFace(measurement) {
        doc.flatten()
        doc.convertToRGB()
        var f = new File(Folder.temp + '/FD.jpg');
        doc.saveACopy(f);
        var result = fd.sendPayload(f.fsName.replace(/\\/g, '\\\\'));
        if (result && result[263] && result[33] && result[152] && result[127] && result[356]) {
            measurement['left'] = [result[33][0] * (1 / global_scale), result[33][1] * (1 / global_scale)]
            measurement['right'] = [result[263][0] * (1 / global_scale), result[263][1] * (1 / global_scale)]
            measurement['bottom'] = [result[152][0] * (1 / global_scale), result[152][1] * (1 / global_scale)]
            measurement['faceLeft'] = [result[127][0] * (1 / global_scale), result[127][1] * (1 / global_scale)]
            measurement['faceRight'] = [result[356][0] * (1 / global_scale), result[356][1] * (1 / global_scale)]
            measurement['middle'] = findMidpoint(measurement['faceRight'], measurement['faceLeft'])
        }
        function findMidpoint(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
    }
    function getAbsoluteBounds(id, measurement) {
        this.id = id
        this.angle = Math.atan2(measurement.right[1] - measurement.left[1], measurement.right[0] - measurement.left[0]) * 180 / Math.PI
        this.widthLeft = Math.sqrt(Math.pow(measurement.faceLeft[0] - measurement.left[0], 2) + Math.pow(measurement.faceLeft[1] - measurement.left[1], 2))
        this.widthRight = Math.sqrt(Math.pow(measurement.faceRight[0] - measurement.right[0], 2) + Math.pow(measurement.faceRight[1] - measurement.right[1], 2))
        this.width = Math.sqrt(Math.pow(measurement.right[0] - measurement.left[0], 2) + Math.pow(measurement.right[1] - measurement.left[1], 2))
        this.height = Math.sqrt(Math.pow(measurement.bottom[0] - measurement.middle[0], 2) + Math.pow(measurement.bottom[1] - measurement.middle[1], 2))
        this.measurement = measurement
        measurement.middle[0] += measurement.bounds.left
        measurement.middle[1] += measurement.bounds.top
        return
    }
}
function transformLayers(targetLayers, baseLayer) {
    var len = targetLayers.length
    lr.selectNoLayers();
    for (var i = 0; i < len; i++) {
        app.changeProgressText("Align layer: " + lr.getProperty("name", targetLayers[i].id))
        if (targetLayers[i] instanceof Object) {
            doc.selectLayers([targetLayers[i].id])
            app.updateProgress(i + 1, len)
            if (targetLayers[i] instanceof Object) {
                var dX = moveMode ? baseLayer.measurement.middle[0] - targetLayers[i].measurement.middle[0] : 0,
                    dY = moveMode ? baseLayer.measurement.middle[1] - targetLayers[i].measurement.middle[1] : 0,
                    dW = 100 * (baseLayer.width / targetLayers[i].width),
                    dH = 100 * (baseLayer.height / targetLayers[i].height),
                    scale = dH > dW ? dH : dW;
                    $.writeln(dX + ' ' + dY)
                lr.move(dX, dY);
                lr.transform(transformMode ? scale : 100, targetLayers[i].measurement.middle[0]+dX, targetLayers[i].measurement.middle[1]+dY, rotateMode ? -targetLayers[i].angle * angle_ratio : 0, dialog_mode)
            }
        }
    }
    doc.selectLayers(selectedLayers)
}
function AM(target, order) {
    var s2t = stringIDToTypeID,
        t2s = typeIDToStringID,
        AR = ActionReference,
        AD = ActionDescriptor;
    target = target ? s2t(target) : null;
    this.getProperty = function (property, id, idxMode, descMode) {
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
    this.convertToSmartObject = function () {
        executeAction(s2t('newPlacedLayer'), undefined, DialogModes.NO)
    }
    this.editSmartObject = function () {
        executeAction(s2t('placedLayerEditContents'), undefined, DialogModes.NO)
    }
    this.saveACopy = function (pth) {
        (d1 = new AD).putInteger(s2t('extendedQuality'), 12);
        d1.putEnumerated(s2t('matteColor'), s2t('matteColor'), s2t('none'));
        (d = new AD).putObject(s2t('as'), s2t('JPEG'), d1);
        d.putPath(s2t('in'), pth);
        d.putBoolean(s2t('copy'), true);
        executeAction(s2t('save'), d, DialogModes.NO);
    }
    this.selectLayers = function (IDList) {
        var r = new ActionReference()
        for (var i = 0; i < IDList.length; i++) {
            r.putIdentifier(s2t("layer"), IDList[i])
        }
        (d = new ActionDescriptor()).putReference(s2t("target"), r)
        d.putBoolean(s2t("makeVisible"), true)
        executeAction(s2t("select"), d, DialogModes.NO)
    }
    this.selectNoLayers = function () {
        (r = new ActionReference()).putEnumerated(s2t("layer"), s2t('ordinal'), s2t('targetEnum'));
        (d = new ActionDescriptor()).putReference(s2t('target'), r);
        executeAction(s2t('selectNoLayers'), d, DialogModes.NO);
    }
    this.isPixlelsLocked = function (desc) {
        if (desc.getBoolean(desc.getKey(1)) || desc.getBoolean(desc.getKey(2)) || desc.getBoolean(desc.getKey(4))) return true
        return false
    }
    this.flatten = function () {
        executeAction(s2t('flattenImage'), undefined, DialogModes.NO);
    }
    this.convertToRGB = function () {
        (d = new ActionDescriptor()).putClass(s2t('to'), s2t('RGBColorMode'))
        executeAction(s2t('convertMode'), d, DialogModes.NO);
    }
    this.close = function (save) {
        save = save != true ? s2t("no") : s2t("yes")
        var desc = new ActionDescriptor()
        desc.putEnumerated(s2t("saving"), s2t("yesNo"), save)
        executeAction(s2t("close"), desc, DialogModes.NO)
    }
    this.selectPreviousHistoryState = function () {
        (r = new ActionReference()).putEnumerated(s2t("historyState"), s2t("ordinal"), s2t("previous"));
        (d = new ActionDescriptor()).putReference(s2t("null"), r);
        executeAction(s2t("select"), d, DialogModes.NO);
    }
    this.setScale = function (width) {
        (d = new ActionDescriptor()).putUnitDouble(s2t("width"), s2t("percentUnit"), width * 100);
        d.putBoolean(s2t("scaleStyles"), true);
        d.putBoolean(s2t("constrainProportions"), true);
        d.putEnumerated(s2t("interpolation"), s2t("interpolationType"), s2t("bilinear"));
        executeAction(s2t("imageSize"), d, DialogModes.NO);
    }
    this.transform = function (scale, cX, cY, angle, dialogMode) {
        dialogMode == DialogModes.ALL ? DialogModes.ALL : DialogModes.NO
        var d = new ActionDescriptor(),
            d1 = new ActionDescriptor(),
            r = new ActionReference();
        r.putEnumerated(s2t('layer'), s2t('ordinal'), s2t('targetEnum'))
        d.putReference(s2t('null'), r)
        d.putEnumerated(s2t('freeTransformCenterState'), s2t('quadCenterState'), s2t('QCSIndependent'))
        d1.putUnitDouble(s2t('horizontal'), s2t('pixelsUnit'), cX)
        d1.putUnitDouble(s2t('vertical'), s2t('pixelsUnit'), cY)
        d.putObject(s2t('position'), s2t('paint'), d1)
        d.putUnitDouble(s2t('width'), s2t('percentUnit'), scale)
        d.putUnitDouble(s2t('height'), s2t('percentUnit'), scale)
        d.putUnitDouble(s2t('angle'), s2t('angleUnit'), angle)
        d.putEnumerated(s2t('interfaceIconFrameDimmed'), s2t('interpolationType'), s2t('bicubic'))
        executeAction(s2t('transform'), d, dialogMode)
    }
    this.move = function (dX, dY) {
        (r = new ActionReference()).putEnumerated(s2t("layer"), s2t("ordinal"), s2t("targetEnum"));
        (d = new ActionDescriptor()).putReference(s2t("null"), r);
        (d1 = new ActionDescriptor()).putUnitDouble(s2t("horizontal"), s2t("pixelsUnit"), dX);
        d1.putUnitDouble(s2t("vertical"), s2t("pixelsUnit"), dY);
        d.putObject(s2t("to"), s2t("offset"), d1);
        executeAction(s2t("move"), d, DialogModes.NO);
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
function faceApi(apiHost, portSend, portListen, apiFile) {
    this.init = function () {
        if (!apiFile.exists) throw new Error(str.errModule)
        apiFile.execute();
        var result = sendMessage({}, INIT_DELAY, false, true);
        if (!result) throw new Error(str.errConnection) else {
            if (result.message = 'init') {
                var result = sendMessage({}, INSTALL_DELAY, false, true, 'Starting face recognition module...');
                if (!result) throw new Error(str.errStarting)
            }
        }
        return true
    }
    this.exit = function () {
        sendMessage({ type: 'exit' }, INIT_DELAY, true, false)
        return true
    }
    this.sendPayload = function (payload) {
        var result = sendMessage({ type: 'payload', message: payload }, DETECTION_DELAY, true, true)
        if (result) return result['message']
        return null;
    }
    function sendMessage(o, delay, sendData, getData, title) {
        var tcp = new Socket,
            delay = delay ? delay : INIT_DELAY;
        if (sendData) {
            tcp.open(apiHost + ':' + portSend, 'UTF-8')
            tcp.writeln(objectToJSON(o))
            tcp.close()
        }
        if (getData) {
            if (title) {
                var w = new Window('palette', title),
                    bar = w.add('progressbar', undefined, 0, PROGRESS_DELAY);
                bar.preferredSize = [350, 20];
                bar.value = 0;
                w.show();
            }
            var tcp = new Socket,
                t1 = (new Date).getTime(),
                t2 = 0,
                t3 = t1;
            if (tcp.listen(portListen, 'UTF-8')) {
                for (; ;) {
                    t2 = (new Date).getTime();
                    if (t2 - t1 > delay) {
                        if (title) w.close();
                        return null;
                    }
                    if (title && t2 - t3 > 100) {
                        t3 = t2
                        if (bar.value >= PROGRESS_DELAY) bar.value = 0;
                        bar.value = bar.value + 100;
                        w.update();
                    }
                    var answer = tcp.poll();
                    if (answer != null) {
                        var a = eval('(' + answer.readln() + ')');
                        answer.close();
                        if (title) {
                            w.close()
                        }
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
function Locale() {
    this.err = { ru: 'Скрипт остановлен', en: 'Script stopped' }
    this.errDoc = { ru: 'Нет активного документа!', en: 'No active document!' }
    this.errLr = { ru: '2 и более слоя должны быть выбраны: нижний слой является образцом размера, остальные будут выровнены по образцу. Слои должны быть незаблокированными!', en: 'Two or more layers must be selected: the bottom layer is the size sample, the others will be aligned to the sample. The layers must be unlocked!' }
    this.errModule = { ru: 'Модуль ' + API_FILE + ' не найден! Убедитесь, что он находится в той же папке что и скрипт!', en: 'Module ' + API_FILE + ' not found! Make sure it in the same folder as the script!' }
    this.errConnection = { ru: 'Невозможно установить соединение c ' + API_FILE, en: 'Impossible to establish a connection with ' + API_FILE }
    this.errStarting = { ru: 'Превышено время ожидания ответа инициализации модуля распознавания лиц! Попробуйте еще раз.', en: 'The face recognition module has timed out initializing! Please try again.' }
}