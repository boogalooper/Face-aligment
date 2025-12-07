/*<javascriptresource>
<category>alignment</category>
<enableinfo>true</enableinfo>
</javascriptresource>
*/
#target photoshop
/**======================================================================== 
 * Настройки скрипта
===========================================================================*/
const moveMode = true// false - выравнивание центра лиц выключено, true - включено
const transformMode = true // false - масштабирование выключено, true - включено
const rotateMode = true // false - поворот головы выключен, true - включен
const angle_ratio = 0.75 // 0-1 - коэффициент применяемый к углу наклона головы
const global_scale = 0.25 // 0-1 - коэффициент масштабирования для ускорения работы со слоями
const dialog_mode = DialogModes.NO // DialogModes.ALL - интерактивная траснформация, DialogModes.NO - трансформация без участия пользователя
/**======================================================================== */
const ver = 0.14,
    API_HOST = '127.0.0.1',
    API_PORT_SEND = 6310,
    API_PORT_LISTEN = 6311,
    API_FILE = 'face-detect-api.pyw',
    INIT_DELAY = 8000,
    INSTALL_DELAY = 150000,
    DETECTION_DELAY = 8000,
    PROGRESS_DELAY = 2500,
    PING_DELAY = 100;
var fd = new faceApi(API_HOST, API_PORT_SEND, API_PORT_LISTEN, new File((new File($.fileName)).path + '/' + API_FILE)),
    s2t = stringIDToTypeID,
    t2s = typeIDToStringID,
    apl = new AM('application'),
    doc = new AM('document'),
    lr = new AM('layer'),
    str = new Locale();
$.localize = true
try {
    var targetLayers = getSelectedLayers();
    if (targetLayers.length > 1 && fd.init()) {
        app.doForcedProgress("Detect faces", "getFacePoints(targetLayers)")
        if (targetLayers[0] instanceof Object)
            app.activeDocument.suspendHistory("Face alignment", (dialog_mode == DialogModes.ALL ? 'transformLayers(targetLayers, targetLayers.shift())' : 'app.doForcedProgress("Align layers", "transformLayers(targetLayers, targetLayers.shift())")'))
        else throw new Error(str.errBaseLayer)
    } else { throw new Error(str.errLr) }
} catch (e) { alert(e, str.err) }
function getSelectedLayers() {
    if (!apl.getProperty("numberOfDocuments")) throw new Error(str.errDoc)
    var sel = doc.getProperty("targetLayersIDs"),
        output = [];
    for (var i = 0; i < sel.count; i++) {
        var id = sel.getReference(i).getIdentifier(),
            kind = lr.getProperty("layerKind", id);
        if (kind == 1 || kind == 5) {
            var locked = lr.descToObject(lr.getProperty("layerLocking", id).value);
            if (lr.getProperty('background', id) || (!locked['protectAll'] && !locked['protectPosition'] && !locked['protectComposite'])) output.push(id)
        }
    }
    return output
}
function getFacePoints(lrs) {
    app.activeDocument.suspendHistory("Detect faces", "function blankState () {return}")
    for (var i = 0; i < lrs.length; i++) {
        app.changeProgressText("Get face bounds: " + lr.getProperty("name", lrs[i]))
        lr.selectLayers([lrs[i]])
        var measurement = {};
        measurement['bounds'] = lr.descToObject(lr.getProperty("boundsNoEffects", lrs[i]).value);
        app.activeDocument.suspendHistory("Measure Face", "measureFace (measurement)")
        doc.selectPreviousHistoryState()
        if (measurement.middle) lrs[i] = new convertToAbsolute(lrs[i], measurement)
    }
    function measureFace(o) {
        lr.convertToSmartObject()
        lr.editSmartObject()
        doc.flatten()
        doc.convertToRGB()
        doc.setScale(global_scale)
        var f = new File(Folder.temp + '/FD.jpg'),
            k = 1 / global_scale;
        doc.saveACopy(f)
        doc.close()
        var faceMesh = fd.sendPayload(f.fsName.replace(/\\/g, '\\\\'));
        if (faceMesh && faceMesh[263] && faceMesh[33] && faceMesh[152] && faceMesh[127] && faceMesh[356]) {
            o['left'] = [faceMesh[33][0] * k, faceMesh[33][1] * k]
            o['right'] = [faceMesh[263][0] * k, faceMesh[263][1] * k]
            o['bottom'] = [faceMesh[152][0] * k, faceMesh[152][1] * k]
            o['faceLeft'] = [faceMesh[127][0] * k, faceMesh[127][1] * k]
            o['faceRight'] = [faceMesh[356][0] * k, faceMesh[356][1] * k]
            o['middle'] = getMidpoint(o['faceRight'], o['faceLeft'])
        }
        function getMidpoint(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
    }
    function convertToAbsolute(id, points) {
        this.id = id
        this.angle = Math.atan2(points.right[1] - points.left[1], points.right[0] - points.left[0]) * 180 / Math.PI
        this.widthLeft = Math.sqrt(Math.pow(points.faceLeft[0] - points.left[0], 2) + Math.pow(points.faceLeft[1] - points.left[1], 2))
        this.widthRight = Math.sqrt(Math.pow(points.faceRight[0] - points.right[0], 2) + Math.pow(points.faceRight[1] - points.right[1], 2))
        this.width = Math.sqrt(Math.pow(points.right[0] - points.left[0], 2) + Math.pow(points.right[1] - points.left[1], 2))
        this.height = Math.sqrt(Math.pow(points.bottom[0] - points.middle[0], 2) + Math.pow(points.bottom[1] - points.middle[1], 2))
        this.measurement = points
        points.middle[0] += points.bounds.left
        points.middle[1] += points.bounds.top
        return
    }
}
function transformLayers(targetLayers, baseLayer) {
    var len = targetLayers.length,
        tmp = [];
    lr.selectNoLayers();
    for (var i = 0; i < len; i++) {
        app.changeProgressText("Align layer: " + lr.getProperty("name", targetLayers[i].id))
        if (targetLayers[i] instanceof Object) {
            tmp.push(targetLayers[i].id)
            doc.selectLayers([targetLayers[i].id])
            app.updateProgress(i + 1, len)
            var dX = moveMode ? baseLayer.measurement.middle[0] - targetLayers[i].measurement.middle[0] : 0,
                dY = moveMode ? baseLayer.measurement.middle[1] - targetLayers[i].measurement.middle[1] : 0,
                dW = 100 * (baseLayer.width / targetLayers[i].width),
                dH = 100 * (baseLayer.height / targetLayers[i].height),
                scale = dH > dW ? dH : dW;
            lr.move(dX, dY);
            lr.transform(transformMode ? scale : 100, targetLayers[i].measurement.middle[0] + dX, targetLayers[i].measurement.middle[1] + dY, rotateMode ? -targetLayers[i].angle * angle_ratio : 0, dialog_mode)
        }
    }
    doc.selectLayers(tmp)
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
        try { return descMode ? executeActionGet(r) : getDescValue(executeActionGet(r), property) } catch (e) { return false };
    }
    this.hasProperty = function (property, id, idxMode) {
        property = s2t(property);
        (r = new AR).putProperty(s2t('property'), property);
        id ? (idxMode ? r.putIndex(target, id) : r.putIdentifier(target, id))
            : r.putEnumerated(target, s2t('ordinal'), s2t('targetEnum'));
        try { return executeActionGet(r).hasKey(property) } catch (e) { return false }
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
    this.selectLayers = function (ids) {
        var r = new AR;
        for (var a in ids) r.putIdentifier(s2t("layer"), ids[a]);
        (d = new AD).putReference(s2t("target"), r)
        d.putBoolean(s2t("makeVisible"), true)
        executeAction(s2t("select"), d, DialogModes.NO)
    }
    this.selectNoLayers = function () {
        (r = new AR).putEnumerated(s2t("layer"), s2t('ordinal'), s2t('targetEnum'));
        (d = new AD).putReference(s2t('target'), r);
        executeAction(s2t('selectNoLayers'), d, DialogModes.NO);
    }
    this.flatten = function () {
        executeAction(s2t('flattenImage'), undefined, DialogModes.NO);
    }
    this.convertToRGB = function () {
        (d = new AD).putClass(s2t('to'), s2t('RGBColorMode'))
        executeAction(s2t('convertMode'), d, DialogModes.NO);
    }
    this.close = function (save) {
        save = save != true ? s2t("no") : s2t("yes");
        (d = new AD).putEnumerated(s2t("saving"), s2t("yesNo"), save);
        executeAction(s2t("close"), d, DialogModes.NO);
    }
    this.selectPreviousHistoryState = function () {
        (r = new AR).putEnumerated(s2t("historyState"), s2t("ordinal"), s2t("previous"));
        (d = new AD).putReference(s2t("null"), r);
        executeAction(s2t("select"), d, DialogModes.NO);
    }
    this.setScale = function (width) {
        (d = new AD).putUnitDouble(s2t("width"), s2t("percentUnit"), width * 100);
        d.putBoolean(s2t("scaleStyles"), true);
        d.putBoolean(s2t("constrainProportions"), true);
        d.putEnumerated(s2t("interpolation"), s2t("interpolationType"), s2t("bilinear"));
        executeAction(s2t("imageSize"), d, DialogModes.NO);
    }
    this.transform = function (scale, cX, cY, angle, dialogMode) {
        dialogMode == DialogModes.ALL ? DialogModes.ALL : DialogModes.NO;
        (r = new AR).putEnumerated(s2t('layer'), s2t('ordinal'), s2t('targetEnum'));
        (d = new AD).putReference(s2t('null'), r);
        d.putEnumerated(s2t('freeTransformCenterState'), s2t('quadCenterState'), s2t('QCSIndependent'));
        (d1 = new AD).putUnitDouble(s2t('horizontal'), s2t('pixelsUnit'), cX);
        d1.putUnitDouble(s2t('vertical'), s2t('pixelsUnit'), cY);
        d.putObject(s2t('position'), s2t('paint'), d1);
        d.putUnitDouble(s2t('width'), s2t('percentUnit'), scale);
        d.putUnitDouble(s2t('height'), s2t('percentUnit'), scale);
        d.putUnitDouble(s2t('angle'), s2t('angleUnit'), angle);
        d.putEnumerated(s2t('interfaceIconFrameDimmed'), s2t('interpolationType'), s2t('bicubic'));
        executeAction(s2t('transform'), d, dialogMode);
    }
    this.move = function (dX, dY) {
        (r = new AR).putEnumerated(s2t("layer"), s2t("ordinal"), s2t("targetEnum"));
        (d = new AD).putReference(s2t("null"), r);
        (d1 = new AD).putUnitDouble(s2t("horizontal"), s2t("pixelsUnit"), dX);
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
        var result = sendMessage({ type: 'handshake', message: '' }, PING_DELAY, true, true)
        if (!result) {
            if (!apiFile.exists) throw new Error(str.errModule)
            apiFile.execute();
            var result = sendMessage({}, INIT_DELAY, false, true);
            if (!result) throw new Error(str.errConnection) else {
                if (result.message = 'init') {
                    var result = sendMessage({}, INSTALL_DELAY, false, true, 'Starting face recognition module...');
                    if (!result) throw new Error(str.errStarting)
                }
            }
        }
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
    this.errLr = { ru: '2 и более слоя должны быть выбраны: нижний слой является образцом размера лица. Слои должны быть незаблокированными!', en: 'Two or more layers must be selected: the bottom layer is the face size sample. The layers must be unlocked!' }
    this.errModule = { ru: 'Модуль ' + API_FILE + ' не найден! Убедитесь, что он находится в той же папке что и скрипт!', en: 'Module ' + API_FILE + ' not found! Make sure it in the same folder as the script!' }
    this.errConnection = { ru: 'Невозможно установить соединение c ' + API_FILE, en: 'Impossible to establish a connection with ' + API_FILE }
    this.errStarting = { ru: 'Превышено время ожидания ответа инициализации модуля распознавания лиц! Попробуйте еще раз.', en: 'The face recognition module has timed out initializing! Please try again.' }
    this.errBaseLayer = { ru: 'Лицо не найдено на нижнем слое!', en: 'Face points not found on bottom layer!' }
}