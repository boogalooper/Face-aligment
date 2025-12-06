#target photoshop
const moveMode = true// false - выравнивание центра лиц выключено, true - включено
const transformMode = true // false - масштабирование выключено, true - включено
const rotateMode = true // false - поворот головы выключен, true - включен
const angle_ratio = 0.8 // 0-1 - коэффициент применяемый к углу наклона головы
const global_scale = 0.25 // 0-1 - коэффициент масштабирования для ускорения работы со слоями
const ver = 0.1,
    API_HOST = '127.0.0.1',
    API_PORT_SEND = 6310,
    API_PORT_LISTEN = 6311,
    API_FILE = 'face-detect-api.pyw',
    INIT_DELAY = 5000,
    DETECTION_DELAY = 8000;
var fd = new faceApi(API_HOST, API_PORT_SEND, API_PORT_LISTEN, new File((new File($.fileName)).path + '/' + API_FILE)),
    s2t = stringIDToTypeID,
    t2s = typeIDToStringID,
    apl = new AM('application'),
    doc = new AM('document'),
    lr = new AM('layer');
var targetLayers = getSelectedLayersIDs(),
    len = targetLayers.length;
if (len > 1 && fd.exit() && fd.init()) {
    var selectedLayers = targetLayers.slice(1);
    app.doForcedProgress("Detect faces", "getFaceBounds(targetLayers)")
    fd.exit()
    if (targetLayers[0] instanceof Object) {
        app.activeDocument.suspendHistory("Face alignment", 'app.doForcedProgress("Align layers", "transformLayers(targetLayers, targetLayers.shift())")')
    }
}
function getSelectedLayersIDs() {
    if (!apl.getProperty("numberOfDocuments")) return []
    var sel = doc.getProperty("targetLayersIDs"),
        len = sel.count,
        output = []
    for (var i = 0; i < len; i++) {
        var id = sel.getReference(i).getIdentifier(),
            kind = lr.getProperty("layerKind", id);
        if (kind == 1 || kind == 5) {
            var locked = lr.descToObject(lr.getProperty("layerLocking", id).value);
            if (lr.getProperty('background',id) || (!locked['protectAll'] && !locked['protectPosition'] && !locked['protectComposite'])) output.push(id)
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
        measurement['bounds'] = lr.descToObject(lr.getProperty("bounds", selectedLayers[i]).value);
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
            measurement['middle'] = findMidpoint(measurement['right'], measurement['left'])
            measurement['faceLeft'] = [result[127][0] * (1 / global_scale), result[127][1] * (1 / global_scale)]
            measurement['faceRight'] = [result[356][0] * (1 / global_scale), result[356][1] * (1 / global_scale)]
        }
        function findMidpoint(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
    }
    function getAbsoluteBounds(id, measurement) {
        this.id = id
        this.angle = Math.atan2(measurement.right[1] - measurement.left[1], measurement.right[0] - measurement.left[0]) * 180 / Math.PI
        this.widthLeft = Math.sqrt(Math.pow(measurement.faceLeft[0] - measurement.left[0], 2) + Math.pow(measurement.faceLeft[1] - measurement.left[1], 2))
        this.widthRight = Math.sqrt(Math.pow(measurement.faceRight[0] - measurement.right[0], 2) + Math.pow(measurement.faceRight[1] - measurement.right[1], 2))
        var k = Math.sqrt(Math.pow((this.widthRight - this.widthLeft) / 2, 2))
        this.width = Math.sqrt(Math.pow(measurement.faceRight[0] - measurement.faceLeft[0], 2) + Math.pow(measurement.faceRight[1] - measurement.faceLeft[1], 2)) + k
        this.height = Math.sqrt(Math.pow(measurement.bottom[0] - measurement.middle[0], 2) + Math.pow(measurement.bottom[1] - measurement.middle[1], 2)) + k
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
                var dX = baseLayer.measurement.middle[0] - targetLayers[i].measurement.middle[0],
                    dY = baseLayer.measurement.middle[1] - targetLayers[i].measurement.middle[1],
                    dW = 100 * (baseLayer.width / targetLayers[i].width),
                    dH = 100 * (baseLayer.height / targetLayers[i].height),
                    scale = dH > dW ? dH : dW;
                lr.transform(transformMode ? scale : 100, targetLayers[i].measurement.middle[0], targetLayers[i].measurement.middle[1], rotateMode ? -targetLayers[i].angle * angle_ratio : 0)
                if (moveMode) lr.move(dX, dY)
            }
        }
    }
    doc.selectLayers(selectedLayers)
}
function AM(target, order) {
    var s2t = stringIDToTypeID,
        t2s = typeIDToStringID,
        AR = ActionReference,
        AD = ActionDescriptor,
        AL = ActionList;
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
    this.waitForRedraw = function () {
        (d = new ActionDescriptor()).putEnumerated(s2t('state'), s2t('state'), s2t('redrawComplete'));
        executeAction(s2t('wait'), d, DialogModes.NO);
    }
    this.addCounter = function (x, y) {
        (d = new ActionDescriptor()).putDouble(s2t("x"), x);
        d.putDouble(s2t("y"), y);
        executeAction(s2t("countAdd"), d, DialogModes.NO);
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
        executeAction(s2t('transform'), d, DialogModes.NO)
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
        if (!apiFile.exists) return false
        apiFile.execute();
        var result = sendMessage({}, INIT_DELAY, false, true);
        if (!result) return false
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
    function sendMessage(o, delay, sendData, getData) {
        var tcp = new Socket,
            delay = delay ? delay : INIT_DELAY;
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