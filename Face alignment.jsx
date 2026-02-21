/*
// BEGIN__HARVEST_EXCEPTION_ZSTRING
<javascriptresource>
<name>Face alignment/name>
<category>actions</category>
<enableinfo>true</enableinfo>
<eventid>7a4144e4-943e-4b5f-8d40-06dfc90b682b</eventid>
<terminology><![CDATA[<< /Version 1
                       /Events <<
                       /7a4144e4-943e-4b5f-8d40-06dfc90b682b [(Face alignment) <<
                       >>]
                        >>
                     >> ]]></terminology>
</javascriptresource>
// END__HARVEST_EXCEPTION_ZSTRING
*/
#target photoshop
const ver = 0.13,
    API_HOST = '127.0.0.1',
    API_PORT_SEND = 6310,
    API_PORT_LISTEN = 6311,
    API_FILE = 'face-detect-api.pyw',
    INIT_DELAY = 8000,
    INSTALL_DELAY = 15000,
    DETECTION_DELAY = 8000,
    PROGRESS_DELAY = 2500,
    PING_DELAY = 100,
    UUID = '7a4144e4-943e-4b5f-8d40-06dfc90b682b';
var fd = new faceApi(API_HOST, API_PORT_SEND, API_PORT_LISTEN, new File((new File($.fileName)).path + '/' + API_FILE)),
    s2t = stringIDToTypeID,
    apl = new AM('application'),
    doc = new AM('document'),
    lr = new AM('layer'),
    str = new Locale(),
    cfg = new Config();
isCancelled = false;
$.localize = true
//$.locale = 'ru'
isCancelled ? 'cancel' : undefined
if (!app.playbackParameters.count) {
    cfg.getScriptSettings()
    var w = dialog(); var result = w.show()
    if (result == 2) { isCancelled = true; } else {
        cfg.putScriptSettings(true)
        main();
    }
    cfg.putScriptSettings()
}
else {
    cfg.getScriptSettings(true)
    if (app.playbackDisplayDialogs == DialogModes.ALL) {
        var w = dialog(true); var result = w.show()
        if (result == 2) { isCancelled = true; } else {
            cfg.putScriptSettings(true)
        }
    }
    if (app.playbackDisplayDialogs != DialogModes.ALL) {
        main();
    }
}
isCancelled ? 'cancel' : undefined
function main() {
    try {
        var curentState = doc.getSelectionMode(),
            targetLayers = getSelectedLayers();
        if (targetLayers.length > 1 && fd.init()) {
            if (curentState == 'imageProcessingModeCloud') doc.setSelectionMode('imageProcessingModeDevice');
            targetLayers.length <= 2 ? getKeyPoints(targetLayers) : app.doForcedProgress("Detect key points", "getKeyPoints(targetLayers)");
            if (targetLayers[0] instanceof Object)
                app.activeDocument.suspendHistory("Face alignment", (targetLayers.length <= 2 || cfg.dialogMode ? 'transformLayers(targetLayers, targetLayers.shift())' : 'app.doForcedProgress("Align layers", "transformLayers(targetLayers, targetLayers.shift())")'))
            else throw new Error(str.errBaseLayer)
        } else { throw new Error(str.errLr) }
    } catch (e) { alert(e, str.err) }
    doc.setSelectionMode(curentState);
}
function dialog(mode) {
    var dialog = new Window("dialog{orientation:'column',alignChildren:['fill','top'],spacing:10,margins:16}"),
        pnMode = dialog.add("panel{orientation:'column',alignChildren:['fill','top'],spacing:10,margins:10}"),
        dlMode = pnMode.add("dropdownlist"),
        stMode = pnMode.add("statictext{properties:{multiline:true},preferredSize:[250,50]}"),
        pnOptions = dialog.add("panel{orientation:'column',alignChildren:['left','top'],spacing:10,margins:[10,20,10,10]}"),
        chMove = pnOptions.add("checkbox"),
        chResize = pnOptions.add("checkbox"),
        chRotate = pnOptions.add("checkbox"),
        grK = pnOptions.add("group{orientation:'column',alignChildren:['left','center'],spacing:0,margins:0}"),
        grKTitle = grK.add("group{orientation:'row',alignChildren:['left','center'],spacing:0,margins:0}"),
        stKTitle = grKTitle.add("statictext{preferredSize:[200,-1]}"),
        stKValue = grKTitle.add("statictext{preferredSize:[50,-1],justify:'right'}"),
        slK = grK.add("slider{minvalue:0,maxvalue:100,preferredSize:[250,-1]}"),
        pnAdditional = dialog.add("panel{orientation:'column',alignChildren:['left','top'],spacing:10,margins:[10,20,10,10]}"),
        chDialogMode = pnAdditional.add("checkbox"),
        grTile = pnAdditional.add("group{orientation:'column',alignChildren:['left','center'],spacing:0,margins:0}"),
        grTileCaption = grTile.add("group{orientation:'row',alignChildren:['left','center'],spacing:0,margins:0}"),
        chTile = grTileCaption.add("checkbox{preferredSize:[200,-1]}"),
        stTileValue = grTileCaption.add("statictext{preferredSize:[50,-1],justify:'right'}"),
        slTile = grTile.add("slider{minvalue:1,maxvalue:8,preferredSize:[250,-1]}"),
        grOk = dialog.add("group{orientation:'row',alignChildren:['center','center'],spacing:10,margins:0}"),
        ok = grOk.add('button', undefined, undefined, { name: 'ok' });
    dialog.text = "Face alignment " + ver;
    pnMode.text = str.modePanel;
    pnOptions.text = str.optionsPanel;
    pnAdditional.text = str.additionalPanel;
    dlMode.add("item", str.modeFace);
    dlMode.add("item", str.modeHalf);
    dlMode.add("item", str.modeFull);
    chMove.text = str.move;
    chResize.text = str.resize;
    chRotate.text = str.rotate;
    chDialogMode.text = str.dialogMode;
    chTile.text = str.tileResize;
    stKTitle.text = str.rotationRatio;
    ok.text = str.save
    chMove.value = cfg.move
    chResize.value = cfg.resize
    chRotate.value = slK.enabled = stKValue.visible = cfg.rotate
    slK.value = cfg.angleRatio * 100
    stKValue.text = cfg.angleRatio
    chTile.value = slTile.enabled = stTileValue.visible = cfg.tile
    slTile.value = cfg.detectSize / 512
    stTileValue.text = cfg.detectSize
    chDialogMode.value = cfg.dialogMode
    dlMode.onChange = function () {
        stMode.text = str.desc[this.selection.index]
        switch (this.selection.index) {
            case 0: cfg.pose = cfg.legs = false; break;
            case 1: cfg.pose = true; cfg.legs = false; break;
            case 2: cfg.pose = cfg.legs = true; break;
        }
    }
    slK.onChanging = function () { stKValue.text = cfg.angleRatio = Math.floor((this.value / 100) * 100) / 100 }
    slK.onChange = slK.onChanging;
    slTile.onChanging = function () {
        this.value = Math.round(this.value)
        stTileValue.text = cfg.detectSize = this.value * 512
    }
    slTile.onChange = slTile.onChanging;
    chDialogMode.onClick = function () { cfg.dialogMode = this.value }
    chTile.onClick = function () {
        cfg.tile = slTile.enabled = stTileValue.visible = this.value
    }
    chMove.onClick = function () { cfg.move = this.value }
    chResize.onClick = function () { cfg.resize = this.value }
    chRotate.onClick = function () { cfg.rotate = slK.enabled = stKValue.visible = this.value }
    dialog.onShow = function () {
        if (!cfg.pose && !cfg.legs) { dlMode.selection = 0 } else if (cfg.pose && !cfg.legs) { dlMode.selection = 1 } else { dlMode.selection = 2 }
        chMove.value = cfg.move
        chResize.value = cfg.resize
        chRotate.value = cfg.rotate
        ok.text = mode ? str.save : str.okButton
        ok.enabled = mode ? true : apl.getProperty('numberOfDocuments') && (getSelectedLayers()).length >= 2;
    }
    return dialog;
}
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
function getKeyPoints(lrs) {
    app.activeDocument.suspendHistory("Detect key points", "function blankState () {return}")
    for (var i = 0; i < lrs.length; i++) {
        app.changeProgressText("Detecting key points in layer: " + lr.getProperty("name", lrs[i]))
        lr.selectLayers([lrs[i]])
        var measurement = {};
        measurement['bounds'] = lr.descToObject(lr.getProperty("boundsNoEffects", lrs[i]).value);
        app.activeDocument.suspendHistory("Measure subject", "measureSubject (measurement)")
        if (i == 0 && measurement.middle == undefined) throw new Error(str.errBaseLayer)
        doc.selectPreviousHistoryState()
        if (measurement.middle) lrs[i] = new convertToAbsolute(lrs[i], measurement)
    }
    function measureSubject(o) {
        if (lr.hasProperty('smartObject')) lr.rasterize();
        lr.convertToSmartObject()
        lr.editSmartObject()
        doc.flatten()
        doc.convertToRGB()
        var docRes = doc.getProperty('resolution'),
            docW = doc.getProperty('width') * docRes / 72,
            docH = doc.getProperty('height') * docRes / 72,
            f = new File(Folder.temp + '/FD.jpg'),
            k = cfg.detectSize / (docW > docH ? docW : docH);
        k < 1 ? doc.setScale(k) : k = 1;
        doc.saveACopy(f)
        var mesh = fd.sendPayload(cfg.pose ? 'pose' : 'face', f.fsName.replace(/\\/g, '\\\\'));
        if (mesh) {
            calcDimensions(o, mesh)
        } else {
            if (!cfg.pose) {
                var mesh = fd.sendPayload('pose', f.fsName.replace(/\\/g, '\\\\'));
                if (!mesh) {
                    var faceRect = {};
                    faceRect.left = mesh[12][0]
                    faceRect.right = mesh[11][0]
                    faceRect.bottom = mesh[11][1] > mesh[12][1] ? mesh[11][1] : mesh[12][1]
                    faceRect.top = mesh[0][1] - (faceRect.bottom - mesh[0][1])
                    faceRect.left -= faceRect.left * 0.2
                    faceRect.right += faceRect.right * 0.2
                    faceRect.bottom += faceRect.bottom * 0.2
                    faceRect.top -= faceRect.top * 0.2
                    doc.makeSelection(faceRect, false)
                } else {
                    doc.selectSubject();
                }
                if (doc.getProperty('selection')) {
                    var relativeBounds = doc.descToObject(doc.getProperty('selection').value);
                    doc.crop(true)
                    doc.saveACopy(f)
                    var mesh = fd.sendPayload('face', f.fsName.replace(/\\/g, '\\\\'));
                    if (mesh) calcDimensions(o, mesh, relativeBounds.left, relativeBounds.top)
                }
            }
        }
        doc.close();
        f.remove();
        function calcDimensions(o, mesh, dX, dY) {
            dX = dX ? dX : 0;
            dY = dY ? dY : 0;
            o['left'] = [(mesh[cfg.pose ? 6 : 33][0] + dX) * 1 / k, (mesh[cfg.pose ? 6 : 33][1] + dY) * 1 / k]
            o['right'] = [(mesh[cfg.pose ? 3 : 263][0] + dX) * 1 / k, (mesh[cfg.pose ? 3 : 263][1] + dY) * 1 / k]
            if (cfg.pose) {
                o['bodyLeft'] = [(mesh[cfg.legs ? 27 : 23][0] + dX) * 1 / k, (mesh[cfg.legs ? 27 : 23][1] + dY) * 1 / k]
                o['bodyRight'] = [(mesh[cfg.legs ? 28 : 24][0] + dX) * 1 / k, (mesh[cfg.legs ? 28 : 24][1] + dY) * 1 / k]
                o['bottom'] = getMidpoint(o['bodyRight'], o['bodyLeft'])
                o['middle'] = getMidpoint(o['left'], o['right'])
            } else {
                o['faceLeft'] = [(mesh[127][0] + dX) * 1 / k, (mesh[127][1] + dY) * 1 / k]
                o['faceRight'] = [(mesh[356][0] + dX) * 1 / k, (mesh[356][1] + dY) * 1 / k]
                o['bottom'] = [(mesh[152][0] + dX) * 1 / k, (mesh[152][1] + dY) * 1 / k]
                o['middle'] = getMidpoint(o['faceRight'], o['faceLeft'])
            }
        }
        function getMidpoint(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
    }
    function convertToAbsolute(id, points) {
        this.id = id
        this.angle = Math.atan2(points.right[1] - points.left[1], points.right[0] - points.left[0]) * 180 / Math.PI
        this.width = Math.sqrt(Math.pow(points.right[0] - points.left[0], 2) + Math.pow(points.right[1] - points.left[1], 2))
        this.height = Math.sqrt(Math.pow(points.bottom[0] - points.middle[0], 2) + Math.pow(points.bottom[1] - points.middle[1], 2))
        this.measurement = points
        points.middle[0] += points.bounds.left
        points.middle[1] += points.bounds.top
        if (!cfg.pose) {
            this.widthLeft = Math.sqrt(Math.pow(points.faceLeft[0] - points.left[0], 2) + Math.pow(points.faceLeft[1] - points.left[1], 2))
            this.widthRight = Math.sqrt(Math.pow(points.faceRight[0] - points.right[0], 2) + Math.pow(points.faceRight[1] - points.right[1], 2))
        }
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
            if (!cfg.pose) {
                var dX = cfg.move ? baseLayer.measurement.middle[0] - targetLayers[i].measurement.middle[0] : 0,
                    dY = cfg.move ? baseLayer.measurement.middle[1] - targetLayers[i].measurement.middle[1] : 0,
                    dW = 100 * (baseLayer.width / targetLayers[i].width),
                    dH = 100 * (baseLayer.height / targetLayers[i].height),
                    scale = dH > dW ? dH : dW;
            } else {
                var dX = cfg.move ? baseLayer.measurement.middle[0] - targetLayers[i].measurement.middle[0] : 0,
                    dY = cfg.move ? baseLayer.measurement.middle[1] - targetLayers[i].measurement.middle[1] : 0,
                    scale = 100 * (baseLayer.height / targetLayers[i].height);
            }
            lr.move(dX, dY);
            if (cfg.dialogMode) lr.setLayerOpacity(60)
            lr.transform(cfg.resize ? scale : 100, targetLayers[i].measurement.middle[0] + dX, targetLayers[i].measurement.middle[1] + dY, cfg.rotate ? -targetLayers[i].angle * cfg.angleRatio : 0, cfg.dialogMode ? DialogModes.ALL : DialogModes.NO)
            if (cfg.dialogMode) lr.setLayerOpacity(100)
        }
    }
    if (tmp.length) doc.selectLayers(tmp)
}
function debug(mesh) {
    for (a in mesh) {
        doc.addCounter(mesh[a][0], mesh[a][1])
    }
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
    this.addCounter = function (x, y) {
        (d = new AD).putDouble(s2t("x"), x);
        d.putDouble(s2t("y"), y);
        executeAction(s2t("countAdd"), d, DialogModes.NO);
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
        d.putBoolean(s2t("linked"), true);
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
    this.rasterize = function () {
        (r = new AR).putEnumerated(s2t('layer'), s2t('ordinal'), s2t('targetEnum'));
        (d = new AD).putReference(s2t('target'), r);
        executeAction(s2t('rasterizeLayer'), d, DialogModes.NO);
    }
    this.getSelectionMode = function () {
        (r = new AR).putProperty(s2t('property'), p = s2t('imageProcessingPrefs'));
        r.putEnumerated(s2t('application'), s2t('ordinal'), s2t('targetEnum'));
        return t2s(executeActionGet(r).getObjectValue(p).getEnumerationValue(s2t('imageProcessingSelectSubjectPrefs')));
    }
    this.setSelectionMode = function (state) {
        (r = new AR).putProperty(s2t("property"), s2t("imageProcessingPrefs"));
        r.putEnumerated(s2t("application"), s2t("ordinal"), s2t("targetEnum"));
        (d = new AD).putReference(s2t("null"), r);
        (d1 = new AD).putEnumerated(s2t("imageProcessingSelectSubjectPrefs"), s2t("imageProcessingSelectSubjectPrefs"), s2t(state));
        d.putObject(s2t("to"), s2t("imageProcessingPrefs"), d1);
        executeAction(s2t("set"), d, DialogModes.NO);
    }
    this.selectSubject = function (sampleAllLayers) {
        sampleAllLayers = sampleAllLayers == undefined ? false : true;
        (d = new AD).putBoolean(s2t('sampleAllLayers'), sampleAllLayers);
        executeAction(s2t('autoCutout'), d, DialogModes.NO);
    }
    this.crop = function (deletePixels) {
        (d = new AD).putBoolean(s2t('delete'), deletePixels);
        executeAction(s2t('crop'), d, DialogModes.NO);
    }
    this.setLayerOpacity = function (opacity) {
        (r = new AR).putEnumerated(s2t("layer"), s2t("ordinal"), s2t("targetEnum"));
        (d = new AD).putReference(s2t("null"), r);
        (d1 = new AD).putUnitDouble(s2t("opacity"), s2t("percentUnit"), opacity);
        d.putObject(s2t("to"), s2t("layer"), d1);
        executeAction(s2t("set"), d, DialogModes.NO);
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
                    var result = sendMessage({}, INSTALL_DELAY, false, true, str.starting);
                    if (!result) throw new Error(str.errStarting)
                    if (result.type == 'error') throw new Error(result.message)
                }
            }
        }
        return true
    }
    this.sendPayload = function (type, payload) {
        var result = sendMessage({ type: type, message: payload }, DETECTION_DELAY, true, true)
        if (result.type == 'answer') return result['message']
        if (result.type == 'error') throw new Error(result.message)
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
    this.errStarting = { ru: 'Превышено время ожидания ответа модуля python!', en: 'The python module has timed out initializing!' }
    this.errBaseLayer = { ru: 'Ключевые точки не найдены на нижнем слое!', en: 'Key points not found on bottom layer!' }
    this.starting = { ru: 'Запуск модуля python...', en: 'Starting python module...' }
    this.modePanel = { ru: 'Тип выравнивания', en: 'Alignment mode' }
    this.optionsPanel = { ru: 'Параметры выравнивания слоёв:', en: 'Layer alignment options:' }
    this.additionalPanel = { ru: 'Дополнительно', en: 'Additional' }
    this.okButton = { ru: 'Выровнять слои', en: 'Align layers' }
    this.move = { ru: 'перемещение', en: 'move' }
    this.resize = { ru: 'изменение размера', en: 'resize' }
    this.rotate = { ru: 'поворот', en: 'rotate' }
    this.dialogMode = { ru: 'интерактивная трансформация', en: 'interactive transform' }
    this.tileResize = { ru: 'ресайз для детектора, px', en: 'resize for detector, px' }
    this.rotationRatio = { ru: 'коэффициент поворота', en: 'rotation ratio' }
    this.modeFace = { ru: 'Погрудный портрет', en: 'Head and shoulders' }
    this.modeHalf = { ru: 'Поколенный портрет', en: 'Half body portrait' }
    this.modeFull = { ru: 'Портрет в полный рост', en: 'Full body portrait' }
    var modeFaceDesc = {
        ru: 'Выравнивание по лицу. Размер рассчитывается по расстоянию между глазами и пропорциям лица. Точно центрирует и при необходимости выравнивает наклон головы.',
        en: 'Face-based alignment. Scale is calculated from the distance between the eyes and facial proportions. Precisely centers and optionally corrects head tilt.'
    },
        modeHalfDesc = {
            ru: 'Выравнивание по фигуре до уровня бёдер. Масштаб определяется по расстоянию от головы до линии бёдер. Подходит для средних планов с видимой позой.',
            en: 'Body alignment up to hip level. Scale is calculated from head to hip line distance. Suitable for medium shots with visible pose.'
        },
        modeFullDesc = {
            ru: 'Выравнивание по всей фигуре. Размер рассчитывается от головы до нижней точки тела. Оптимально для портретов в полный рост с сохранением пропорций.',
            en: 'Full body alignment. Scale is calculated from head to the lowest body point. Ideal for full-height portraits while preserving proportions.'
        };
    this.desc = [modeFaceDesc, modeHalfDesc, modeFullDesc]
    this.save = { ru: 'Сохранить настройки', en: 'Save settings' }
}
function Config() {
    settingsObj = this
    this.move = true
    this.resize = true
    this.rotate = false
    this.angleRatio = 0.75
    this.detectSize = 1024
    this.dialogMode = false
    this.pose = false
    this.legs = false
    this.tile = true
    this.getScriptSettings = function (fromAction) {
        if (fromAction) var d = playbackParameters; else try { var d = getCustomOptions(UUID) } catch (e) { };
        if (d != undefined) descriptorToObject(settingsObj, d)
        function descriptorToObject(o, d) {
            var l = d.count;
            for (var i = 0; i < l; i++) {
                var k = d.getKey(i),
                    t = d.getType(k),
                    s = app.typeIDToStringID(k);
                switch (t) {
                    case DescValueType.BOOLEANTYPE: o[s] = d.getBoolean(k); break;
                    case DescValueType.STRINGTYPE: o[s] = d.getString(k); break;
                    case DescValueType.DOUBLETYPE: o[s] = d.getDouble(k); break;
                }
            }
        }
    }
    this.putScriptSettings = function (toAction) {
        var d = objectToDescriptor(settingsObj, UUID)
        if (toAction) playbackParameters = d else putCustomOptions(UUID, d, true);
        function objectToDescriptor(o) {
            var d = new ActionDescriptor;
            var l = o.reflect.properties.length;
            for (var i = 0; i < l; i++) {
                var k = o.reflect.properties[i].toString();
                if (k == '__proto__' || k == '__count__' || k == '__class__' || k == 'reflect') continue;
                var v = o[k];
                k = app.stringIDToTypeID(k);
                switch (typeof (v)) {
                    case 'boolean': d.putBoolean(k, v); break;
                    case 'string': d.putString(k, v); break;
                    case 'number': d.putDouble(k, v); break;
                }
            }
            return d;
        }
    }
}