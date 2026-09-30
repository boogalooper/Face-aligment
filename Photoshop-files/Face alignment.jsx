#target photoshop
/*
// BEGIN__HARVEST_EXCEPTION_ZSTRING
<javascriptresource>
<name>Face alignment</name>
<category>alignment</category>
<enableinfo>true</enableinfo>
<eventid>7a4144e4-943e-4b5f-8d40-06dfc90b682b</eventid>
<terminology><![CDATA[<< /Version 1
                       /Events <<
                       /7a4144e4-943e-4b5f-8d40-06dfc90b682b [(Face alignment) <<
                       /inAction [(action settings) /boolean]
                       >>]
                        >>
                     >> ]]></terminology>
</javascriptresource>
// END__HARVEST_EXCEPTION_ZSTRING
*/
const ver = 0.141,
    API_HOST = '127.0.0.1',
    API_PORT_SEND = 6330,
    API_PORT_LISTEN = 6331,
    API_FILE = 'face-detect-api',
    INIT_DELAY = 60000,
    DETECTION_DELAY = 60000,
    PROGRESS_DELAY = 2500,
    PING_DELAY = 100,
    UUID = '7a4144e4-943e-4b5f-8d40-06dfc90b682b';
var fd = new faceApi(API_HOST, API_PORT_SEND, API_PORT_LISTEN, API_FILE),
    s2t = stringIDToTypeID,
    apl = new AM('application'),
    doc = new AM('document'),
    lr = new AM('layer'),
    str = new Locale(),
    cfg = new Config(),
    inAction = true,
    isDirty = false,
    pendingPreviews = [];
isCancelled = false;
$.localize = true
//$.locale = 'ru'
isCancelled ? 'cancel' : undefined;
if (!app.playbackParameters.count || app.playbackParameters.count == 1) {
    cfg.getScriptSettings()
    var w = dialog(); var result = w.show()
    if (result == 2) { isCancelled = true; } else {
        cfg.putScriptSettings(true)
        app.doProgress("", "main();");
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
        app.doProgress("", "main();");
    }
}
isCancelled ? 'cancel' : undefined;
function main() {
    try {
        var curentState = doc.getSelectionMode(),
            targetLayers = getSelectedLayers(),
            docState = activeDocument.currentHistoryState,
            docId = doc.getProperty('documentID');
        if (targetLayers.length > 1 && fd.init()) {
            if (curentState == 'imageProcessingModeCloud') doc.setSelectionMode('imageProcessingModeDevice');
            targetLayers.length <= 2 ? getKeyPoints(targetLayers) : app.doProgressSegmentTask(targetLayers.length, 0, targetLayers.length * 2, "getKeyPoints(targetLayers)");
            if (targetLayers[0] instanceof Object && targetLayers[0].measurement && targetLayers[0].measurement.middle)
                app.activeDocument.suspendHistory("Face alignment", (targetLayers.length <= 2 || cfg.dialogMode ? 'transformLayers(targetLayers, targetLayers.shift())' : 'app.doProgressSegmentTask(' + [targetLayers.length, targetLayers.length, targetLayers.length * 2].join(', ') + ', "transformLayers(targetLayers, targetLayers.shift())")'))
            else throw new Error(str.errBaseLayer)
        } else { throw new Error(str.errLr) }
    } catch (e) {
        if (doc.getProperty('documentID') != docId) doc.close(false);
        activeDocument.currentHistoryState = docState;
        if (!cfg.silentMode && !(e.number && e.number == 8007)) alert(e, str.err)
    } finally {
        cleanupPreviews();
    }
    doc.setSelectionMode(curentState);
}
function removePreview(path) {
    for (var attempt = 0; attempt < 3; attempt++) {
        var file = new File(path);
        try { if (!file.exists || file.remove()) return true; } catch (e) { }
        $.sleep(50);
    }
    return false;
}
function cleanupPreviews() {
    for (var i = 0; i < pendingPreviews.length; i++) {
        var path = pendingPreviews[i];
        if (!removePreview(path)) {
            try { fd.cleanup(path); } catch (e) { }
            if (!removePreview(path)) $.writeln('Face alignment: deferred JPEG cleanup: ' + path);
        }
    }
    pendingPreviews = [];
}
function dialog(mode) {
    var dialog = new Window("dialog{orientation:'column',alignChildren:['fill','top'],spacing:10,margins:16}"),
        pnMode = dialog.add("panel{orientation:'column',alignChildren:['fill','top'],spacing:10,margins:10}"),
        dlMode = pnMode.add("dropdownlist"),
        stMode = pnMode.add("statictext{properties:{multiline:true},preferredSize:[250,70]}"),
        chAuto = pnMode.add("checkbox"),
        pnOptions = dialog.add("panel{orientation:'column',alignChildren:['left','top'],spacing:10,margins:[10,20,10,10]}"),
        chMove = pnOptions.add("checkbox"),
        chResize = pnOptions.add("checkbox"),
        chHead = pnOptions.add("checkbox"),
        chRotate = pnOptions.add("checkbox"),
        chReferenceTilt = pnOptions.add("checkbox"),
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
        chSilent = dialog.add('checkbox')
    grOk = dialog.add("group{orientation:'row',alignChildren:['center','center'],spacing:10,margins:0}"),
        ok = grOk.add('button', undefined, undefined, { name: 'ok' });
    dialog.text = "Face alignment " + ver;
    pnMode.text = str.modePanel;
    pnOptions.text = str.optionsPanel;
    pnAdditional.text = str.additionalPanel;
    chSilent.text = str.silentMode
    dlMode.add("item", str.modeFace);
    dlMode.add("item", str.modeHalf);
    dlMode.add("item", str.modeFull);
    chMove.text = str.move;
    chResize.text = str.resize;
    chHead.text = str.headSupport;
    chHead.value = cfg.headSupport;
    chHead.onClick = function () { cfg.headSupport = this.value; };
    chRotate.text = str.rotate;
    chReferenceTilt.text = str.referenceTilt;
    chDialogMode.text = str.dialogMode;
    chTile.text = str.tileResize;
    stKTitle.text = str.rotationRatio;
    chAuto.text = str.auto;
    ok.text = str.save
    chAuto.value = cfg.auto
    dlMode.enabled = !cfg.auto
    chMove.value = cfg.move
    chResize.value = cfg.resize
    chRotate.value = slK.enabled = stKValue.visible = cfg.rotate
    chReferenceTilt.value = cfg.referenceTilt
    chReferenceTilt.enabled = cfg.rotate
    slK.value = cfg.angleRatio * 100
    stKValue.text = cfg.angleRatio
    chTile.value = slTile.enabled = stTileValue.visible = cfg.tile
    slTile.value = cfg.detectSize / 512
    stTileValue.text = cfg.detectSize
    chDialogMode.value = cfg.dialogMode
    chSilent.value = cfg.silentMode
    dlMode.onChange = function () {
        stMode.text = str.desc[this.selection.index]
        chHead.enabled = cfg.resize && (cfg.auto || this.selection.index == 0);
        switch (this.selection.index) {
            case 0: cfg.pose = cfg.legs = false; break;
            case 1: cfg.pose = true; cfg.legs = false; break;
            case 2: cfg.pose = cfg.legs = true; break;
        }
    }
    chSilent.onClick = function () {
        cfg.silentMode = this.value
    }
    slK.onChanging = function () { stKValue.text = cfg.angleRatio = Math.floor((this.value / 100) * 100) / 100 }
    slK.onChange = slK.onChanging;
    slTile.onChanging = function () {
        this.value = Math.round(this.value)
        stTileValue.text = cfg.detectSize = this.value * 512
    }
    chAuto.onClick = function () {
        cfg.auto = this.value
        dlMode.enabled = !this.value
        chHead.enabled = cfg.resize && (cfg.auto || !cfg.pose);
    }
    slTile.onChange = slTile.onChanging;
    chDialogMode.onClick = function () { cfg.dialogMode = this.value }
    chTile.onClick = function () {
        cfg.tile = slTile.enabled = stTileValue.visible = this.value
    }
    chMove.onClick = function () { cfg.move = this.value; ok.enabled = chMove.value || chResize.value || chRotate.value }
    chResize.onClick = function () { cfg.resize = this.value; chHead.enabled = cfg.resize && (cfg.auto || !cfg.pose); ok.enabled = chMove.value || chResize.value || chRotate.value }
    chReferenceTilt.onClick = function () { cfg.referenceTilt = this.value }
    chRotate.onClick = function () { cfg.rotate = slK.enabled = stKValue.visible = chReferenceTilt.enabled = this.value; ok.enabled = chMove.value || chResize.value || chRotate.value }
    dialog.onShow = function () {
        if (!cfg.pose && !cfg.legs) { dlMode.selection = 0 } else if (cfg.pose && !cfg.legs) { dlMode.selection = 1 } else { dlMode.selection = 2 }
        chMove.value = cfg.move
        chResize.value = cfg.resize
        chRotate.value = cfg.rotate
        chReferenceTilt.value = cfg.referenceTilt
        chReferenceTilt.enabled = cfg.rotate
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
    var slice = 1 / (lrs.length);
    for (var i = 0; i < lrs.length; i++) {
        var text = "Detecting key points in layer: " + lr.getProperty("name", lrs[i]);
        app.doProgressTask(slice, "workChunk(text, lrs, i)")
    }
    function workChunk(text, lrs, i) {
        lr.selectLayers([lrs[i]])
        var measurement = {};
        measurement['bounds'] = lr.descToObject(lr.getProperty("boundsNoEffects", lrs[i]).value);
        app.activeDocument.suspendHistory("Measure subject", "measureSubject (measurement)")
        if (i == 0 && measurement.middle == undefined) throw new Error(str.errBaseLayer)
        doc.selectPreviousHistoryState()
        if (measurement.middle) lrs[i] = new convertToAbsolute(lrs[i], measurement)
        app.changeProgressText(text);
        $.sleep(0);
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
            f = new File(Folder.temp + '/FD_' + doc.getProperty('documentID') + '_' + (new Date()).getTime() + '_' + Math.floor(Math.random() * 1000000) + '.jpg'),
            k = cfg.detectSize / (docW < docH ? docW : docH);
        pendingPreviews.push(f.fsName);
        try {
        k < 1 ? doc.setScale(k) : k = 1;
        doc.saveACopy(f)
        if (cfg.auto && !isDirty) {
            var mesh = fd.sendPayload('pose', f.fsName),
                detectW = docW * k,
                detectH = docH * k;
            if (mesh) {
                cfg.pose = pointIsVisible(mesh[23], detectW, detectH) && pointIsVisible(mesh[24], detectW, detectH);
                cfg.legs = cfg.pose && pointIsVisible(mesh[27], detectW, detectH) && pointIsVisible(mesh[28], detectW, detectH);
            } else {
                cfg.pose = false
                cfg.legs = false
            }
            isDirty = true
        }
        if (!(mesh && cfg.pose)) {
            var mesh = fd.sendPayload(cfg.pose ? 'pose' : 'face', f.fsName);
        }
        if (mesh) {
            calcDimensions(o, mesh)
        } else {
            if (!cfg.pose) {
                var mesh = fd.sendPayload('pose', f.fsName);
                if (mesh) {
                    var fp = findPairPoints(mesh, [[5, 2], [6, 3], [4, 1], [8, 7], [0, 0], [10, 9]]),
                        bp = findPairPoints(mesh, [[12, 11], [24, 23], [14, 13]]);
                    if (fp && bp && mesh[0]) {
                        var faceRect = {},
                            detectW = docW * k,
                            detectH = docH * k,
                            x1 = mesh[fp[0]][0],
                            x2 = mesh[fp[1]][0];
                        faceRect.left = x1 < x2 ? x1 : x2
                        faceRect.right = x1 > x2 ? x1 : x2
                        faceRect.bottom = mesh[bp[0]][1] > mesh[bp[1]][1] ? mesh[bp[0]][1] : mesh[bp[1]][1]
                        faceRect.top = mesh[0][1] - (faceRect.bottom - mesh[0][1])
                        var faceW = faceRect.right - faceRect.left,
                            faceH = faceRect.bottom - faceRect.top,
                            padX = faceW * 0.2,
                            padY = faceH * 0.2;
                        faceRect.left = Math.max(0, faceRect.left - padX)
                        faceRect.right = Math.min(detectW, faceRect.right + padX)
                        faceRect.top = Math.max(0, faceRect.top - padY)
                        faceRect.bottom = Math.min(detectH, faceRect.bottom + padY)
                        if (faceRect.right > faceRect.left && faceRect.bottom > faceRect.top) doc.makeSelection(faceRect, false)
                    }
                }
                if (!doc.getProperty('selection')) {
                    try { doc.selectSubject(); } catch (e) { }
                }
                if (doc.getProperty('selection')) {
                    var relativeBounds = doc.descToObject(doc.getProperty('selection').value);
                    doc.crop(true)
                    doc.saveACopy(f)
                    var mesh = fd.sendPayload('face', f.fsName);
                    if (mesh) calcDimensions(o, mesh, relativeBounds.left, relativeBounds.top)
                }
            }
        }
        } finally {
            // Closing the preview must not prevent file cleanup on errors/cancel.
            try { doc.close(); } finally {
                if (!removePreview(f.fsName)) {
                    try { fd.cleanup(f.fsName); } catch (cleanupError) { }
                }
            }
        }
        function pointIsVisible(p, width, height) {
            return p && p[2] > 0.5 && p[0] >= 0 && p[0] <= width && p[1] >= 0 && p[1] <= height;
        }
        function calcDimensions(o, mesh, dX, dY) {
            try {
                dX = dX ? dX : 0;
                dY = dY ? dY : 0;
                var fp = null, bp = null;
                if (cfg.pose) {
                    fp = findPairPoints(mesh, [[5, 2], [6, 3], [4, 1], [8, 7], [0, 0], [10, 9]])
                    bp = cfg.legs ? findPairPoints(mesh, [[28, 27], [26, 25], [32, 31], [30, 29]]) : findPairPoints(mesh, [[24, 23], [26, 25]]);
                    if (!fp || !bp) throw new Error()
                }
                o['left'] = [(mesh[cfg.pose ? fp[0] : 33][0] + dX) * 1 / k, (mesh[cfg.pose ? fp[0] : 33][1] + dY) * 1 / k]
                o['right'] = [(mesh[cfg.pose ? fp[1] : 263][0] + dX) * 1 / k, (mesh[cfg.pose ? fp[1] : 263][1] + dY) * 1 / k]
                if (cfg.pose) {
                    o['bodyLeft'] = [(mesh[bp[0]][0] + dX) * 1 / k, (mesh[bp[0]][1] + dY) * 1 / k]
                    o['bodyRight'] = [(mesh[bp[1]][0] + dX) * 1 / k, (mesh[bp[1]][1] + dY) * 1 / k]
                    o['bottom'] = getMidpoint(o['bodyRight'], o['bodyLeft'])
                    o['middle'] = getMidpoint(o['left'], o['right'])
                } else {
                    o['metrics'] = faceMetrics(mesh, k);
                    o['faceLeft'] = [(mesh[127][0] + dX) * 1 / k, (mesh[127][1] + dY) * 1 / k]
                    o['faceRight'] = [(mesh[356][0] + dX) * 1 / k, (mesh[356][1] + dY) * 1 / k]
                    o['bottom'] = [(mesh[152][0] + dX) * 1 / k, (mesh[152][1] + dY) * 1 / k]
                    o['middle'] = getMidpoint(o['faceRight'], o['faceLeft'])
                }
            } catch (e) { }
        }
        function findPairPoints(mesh, pairs) {
            for (var i = 0; i < pairs.length; i++) {
                if (mesh[pairs[i][0]] && mesh[pairs[i][1]]) return pairs[i]
            }
            return null
        }
        function getMidpoint(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
    }
    function convertToAbsolute(id, points) {
        this.id = id
        this.angle = Math.atan2(points.right[1] - points.left[1], points.right[0] - points.left[0]) * 180 / Math.PI
        this.width = Math.sqrt(Math.pow(points.right[0] - points.left[0], 2) + Math.pow(points.right[1] - points.left[1], 2))
        this.height = Math.sqrt(Math.pow(points.bottom[0] - points.middle[0], 2) + Math.pow(points.bottom[1] - points.middle[1], 2))
        this.measurement = points
        this.metrics = points.metrics;
        points.middle[0] += points.bounds.left
        points.middle[1] += points.bounds.top
        if (!cfg.pose) {
            this.widthLeft = Math.sqrt(Math.pow(points.faceLeft[0] - points.left[0], 2) + Math.pow(points.faceLeft[1] - points.left[1], 2))
            this.widthRight = Math.sqrt(Math.pow(points.faceRight[0] - points.right[0], 2) + Math.pow(points.faceRight[1] - points.right[1], 2))
        }
        return this
    }
}
// Distances are rotation-invariant and measured before adding layer offsets.
function faceMetrics(mesh, k) {
    function point(i) {
        var p = mesh[i];
        return p && isFinite(p[0]) && isFinite(p[1]) ? [p[0]/k,p[1]/k] : null;
    }
    function mid(a,b) { return a && b ? [(a[0]+b[0])/2,(a[1]+b[1])/2] : null; }
    function distance(a,b) {
        if (!a || !b) return 0;
        return Math.sqrt(Math.pow(a[0]-b[0],2)+Math.pow(a[1]-b[1],2));
    }
    var eyes = mid(point(33),point(263));
    return {
        outerEyes: distance(point(33),point(263)),
        innerEyes: distance(point(133),point(362)),
        faceWidth: distance(point(234),point(454)),
        templeWidth: distance(point(127),point(356)),
        eyeChin: distance(eyes,point(152)),
        upperFace: distance(point(168),point(152)),
        head: mesh.head && mesh.head.quality >= .8 && isFinite(mesh.head.height) ? mesh.head.height/k : 0
    };
}
function portraitScale(base, target, useHead) {
    var a=base.metrics, b=target.metrics;
    if (!a || !b) throw new Error('Face measurements are incomplete.');
    var names=['outerEyes','innerEyes','faceWidth','templeWidth','eyeChin','upperFace'],
        weights=[.25,.10,.15,.10,.25,.15], items=[], sum=0;
    for(var i=0;i<names.length;i++) {
        var x=a[names[i]], y=b[names[i]];
        if (isFinite(x) && isFinite(y) && x>2 && y>2) {
            items.push({value:Math.log(x/y),weight:weights[i]}); sum+=weights[i];
        }
    }
    if(items.length<4 || !a.outerEyes || !b.outerEyes) throw new Error('Not enough reliable face measurements.');
    items.sort(function(x,y){return x.value-y.value;});
    var acc=0, center=items[0].value;
    for(var i=0;i<items.length;i++) { acc+=items[i].weight; if(acc>=sum/2) {center=items[i].value;break;} }
    // Reject gross disagreement first; cap influence of smaller discrepancies.
    var accepted=[], cutoff=Math.log(1.25), huber=Math.log(1.06);
    for(var i=0;i<items.length;i++) if(Math.abs(items[i].value-center)<=cutoff) accepted.push(items[i]);
    if(accepted.length<3) throw new Error('Face proportions disagree; automatic scaling is unreliable.');
    for(var pass=0;pass<3;pass++) {
        var total=0, weighted=0;
        for(var i=0;i<accepted.length;i++) {
            var residual=Math.abs(accepted[i].value-center),
                w=accepted[i].weight*(residual>huber?huber/residual:1);
            total+=w; weighted+=w*accepted[i].value;
        }
        center=weighted/total;
    }
    if(useHead && a.head>0 && b.head>0 && isFinite(a.head) && isFinite(b.head)) {
        var delta=Math.log(a.head/b.head)-center;
        // Different hairstyles/uncertain contour must not overturn facial scale.
        if(Math.abs(delta)<=Math.log(1.20)) center+=Math.max(-Math.log(1.025),Math.min(Math.log(1.025),delta*.12));
    }
    var result=100*Math.exp(center);
    if(!isFinite(result) || result<=0) throw new Error('Invalid face scale.');
    return result;
}

function transformLayers(targetLayers, baseLayer) {
    var len = targetLayers.length,
        tmp = [],
        slice = 1 / (targetLayers.length);
    lr.selectNoLayers();
    for (var i = 0; i < len; i++) {
        var text = "Align layer: " + lr.getProperty("name", targetLayers[i].id);
        app.doProgressTask(slice, "workChunk(text, targetLayers, baseLayer, i)")
    }
    if (tmp.length) doc.selectLayers(tmp)
    function normalizeAngle(angle) {
        while (angle > 180) angle -= 360;
        while (angle < -180) angle += 360;
        return angle;
    }
    function workChunk(text, targetLayers, baseLayer, i) {
        if (targetLayers[i] instanceof Object && targetLayers[i].measurement && targetLayers[i].measurement.middle) {
            tmp.push(targetLayers[i].id)
            doc.selectLayers([targetLayers[i].id])
            app.updateProgress(i + 1, len)
            if (!cfg.pose) {
                var dX = cfg.move ? baseLayer.measurement.middle[0] - targetLayers[i].measurement.middle[0] : 0,
                    dY = cfg.move ? baseLayer.measurement.middle[1] - targetLayers[i].measurement.middle[1] : 0,
                    scale = cfg.resize ? portraitScale(baseLayer, targetLayers[i], cfg.headSupport) : 100;
            } else {
                var dX = cfg.move ? baseLayer.measurement.middle[0] - targetLayers[i].measurement.middle[0] : 0,
                    dY = cfg.move ? baseLayer.measurement.middle[1] - targetLayers[i].measurement.middle[1] : 0,
                    scale = 100 * (baseLayer.height / targetLayers[i].height);
            }
            lr.move(dX, dY);
            if (cfg.dialogMode) lr.setLayerOpacity(60)
            var rotation = 0;
            if (cfg.rotate) {
                rotation = cfg.referenceTilt ? normalizeAngle(baseLayer.angle - targetLayers[i].angle) : -targetLayers[i].angle;
                rotation *= cfg.angleRatio;
            }
            lr.transform(cfg.resize ? scale : 100, targetLayers[i].measurement.middle[0] + dX, targetLayers[i].measurement.middle[1] + dY, rotation, cfg.dialogMode ? DialogModes.ALL : DialogModes.NO)
            if (cfg.dialogMode) lr.setLayerOpacity(100)
        }
        app.changeProgressText(text);
        $.sleep(0);
    }
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
        (d1 = new AD).putInteger(s2t('extendedQuality'), 6);
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
        d.putEnumerated(s2t("interpolation"), s2t("interpolationType"), s2t("nearestNeighbor"));
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
    var sequence=0, session=(new Date()).getTime()+'-'+Math.floor(Math.random()*1000000),
        serverID='face-alignment/0.138';
    function runtimeFiles() {
        var local=$.getenv('LOCALAPPDATA');
        if(!local) throw new Error('LOCALAPPDATA is unavailable.');
        var root=local+'/JazzyScripts/FaceAlignmentRuntime';
        return {root:root,python:new File(root+'/venv/Scripts/pythonw.exe'),
            launcher:new File(root+'/launcher.vbs'),marker:new File(root+'/runtime_version.txt')};
    }
    function ready() {
        var r=runtimeFiles();
        if(!r.python.exists || !r.launcher.exists || !r.marker.exists) return false;
        var names=['face_landmarker.task','pose_landmarker_heavy.task','human.onnx','face.onnx'];
        for(var i=0;i<names.length;i++) if(!(new File(r.root+'/venv/models/'+names[i])).exists) return false;
        return true;
    }
    function ensureRuntime() {
        if(ready()) return;
        var folder=new File($.fileName).parent, installer=new File(folder.fsName+'/install_runtime.bat');
        if(!installer.exists) installer=new File(folder.parent.fsName+'/install_runtime.bat');
        if(!installer.exists) throw new Error('Run install_runtime.bat from the Face alignment package first.');
        if(!installer.execute()) throw new Error('Cannot start install_runtime.bat. Run it manually.');
        var w=new Window('palette','Face alignment — установка Python'),
            label=w.add('statictext',undefined,'Завершите установку в открывшемся окне.'),
            cancel=w.add('button',undefined,'Закрыть ожидание'), stopped=false,
            start=(new Date()).getTime();
        cancel.onClick=function(){stopped=true;};
        w.onClose=function(){stopped=true;}; w.show();
        try {
            while(!ready()) {
                w.update();
                if(stopped || (new Date()).getTime()-start>30*60*1000)
                    throw new Error('Runtime installation is not complete. Finish install_runtime.bat and run the script again.');
                $.sleep(100);
            }
        } finally {w.close();}
    }
    function isHandshake(result) { return result && result.type=='answer' && result.message==serverID && result.server_id==serverID; }
    this.init=function() {
        var result=sendMessage({type:'handshake',message:''},1000);
        if(isHandshake(result)) return true;
        if(result) throw new Error('Port '+portSend+' is occupied by an incompatible server.');
        var f=findPythonModule(apiFile);
        if(!f) throw new Error(str.errModule);
        ensureRuntime();
        var r=runtimeFiles();
        $.setenv('FACE_ALIGNMENT_SERVER',f.fsName);
        if(!r.launcher.execute()) throw new Error('Cannot start private Python launcher.');
        var start=(new Date()).getTime();
        app.changeProgressText(str.starting);
        while((new Date()).getTime()-start<INIT_DELAY) {
            result=sendMessage({type:'handshake',message:''},1000);
            if(isHandshake(result)) return true;
            if(result) throw new Error('Unexpected server response on port '+portSend);
            $.sleep(150);
        }
        throw new Error('Cannot start Face alignment server. Run install_runtime.bat again; details: '+r.root+'/server.log');
    };
    function findPythonModule(name) {
        var folder=new File($.fileName).parent;
        var paths=[folder.fsName+'/lib/'+name+'.pyw',folder.fsName+'/'+name+'.pyw'];
        for(var i=0;i<paths.length;i++) {var f=new File(paths[i]);if(f.exists)return f;}
        return null;
    }
    this.cleanup=function(path) {
        return sendMessage({type:'cleanup',message:path},1500);
    };
    this.sendPayload=function(type,payload) {
        var result=sendMessage({type:type,message:payload,head_support:!!(cfg.headSupport && cfg.resize)},DETECTION_DELAY);
        if(!result) throw new Error(str.errDetectionTimeout);
        if(result.server_id!=serverID) throw new Error('Unexpected detection server.');
        if(result.type=='error') throw new Error(result.message);
        return result.type=='answer'?result.message:null;
    };
    function sendMessage(o,delay) {
        o.request_id=session+'-'+(++sequence);
        var listener=new Socket(),sender=new Socket();
        if(!listener.listen(portListen,'UTF-8')) throw new Error('Response port '+portListen+' is busy.');
        try {
            sender.timeout=1;
            if(!sender.open(apiHost+':'+portSend,'UTF-8')) return null;
            sender.writeln(objectToJSON(o));sender.close();
            var start=(new Date()).getTime();
            while((new Date()).getTime()-start<delay) {
                var answer=listener.poll();
                if(answer) {
                    var parsed=null;
                    try {answer.timeout=5; parsed=eval('('+answer.readln()+')');} catch(e) {} finally {answer.close();}
                    if(parsed && parsed.request_id==o.request_id) return parsed;
                }
                $.sleep(5);
            }
            return null;
        } finally {try{sender.close();}catch(e){} listener.close();}
    }
    function objectToJSON(o) {
        function quote(s) {return '"'+String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'\\r').replace(/\n/g,'\\n').replace(/\t/g,'\\t')+'"';}
        if(o===null)return 'null';
        if(typeof o=='string')return quote(o);
        if(typeof o=='number' || typeof o=='boolean')return String(o);
        var parts=[];
        for(var key in o)if(o.hasOwnProperty(key))parts.push(quote(key)+':'+objectToJSON(o[key]));
        return '{'+parts.join(',')+'}';
    }
}

function Locale() {
    this.err = { ru: 'Скрипт остановлен', en: 'Script stopped' }
    this.errDoc = { ru: 'Нет активного документа!', en: 'No active document!' }
    this.errLr = { ru: '2 и более слоя должны быть выбраны: нижний слой является образцом размера лица. Слои должны быть незаблокированными!', en: 'Two or more layers must be selected: the bottom layer is the face size sample. The layers must be unlocked!' }
    this.errModule = { ru: 'Модуль ' + API_FILE + ' не найден! Убедитесь, что он находится в той же папке что и скрипт!', en: 'Module ' + API_FILE + ' not found! Make sure it in the same folder as the script!' }
    this.errConnection = { ru: 'Невозможно установить соединение c ' + API_FILE, en: 'Impossible to establish a connection with ' + API_FILE }
    this.errDetectionTimeout = { ru: 'Превышено время ожидания ответа детектора', en: 'Detector response timeout' }
    this.errBaseLayer = { ru: 'Ключевые точки не найдены на нижнем слое!', en: 'Key points not found on bottom layer!' }
    this.starting = { ru: 'Запуск модуля python...', en: 'Starting python module...' }
    this.modePanel = { ru: 'Тип выравнивания', en: 'Alignment mode' }
    this.optionsPanel = { ru: 'Параметры выравнивания слоёв:', en: 'Layer alignment options:' }
    this.additionalPanel = { ru: 'Дополнительно', en: 'Additional' }
    this.okButton = { ru: 'Выровнять слои', en: 'Align layers' }
    this.auto = { ru: 'автоматическое выравнивание', en: 'automatic alignment mode' }
    this.move = { ru: 'совмещение центральных точек лиц', en: 'fit central points of faces' }
    this.headSupport = { ru: 'учитывать контур головы (мягкая поправка)', en: 'use head contour (small scale adjustment)' }
    this.resize = { ru: 'подгонка по размеру', en: 'size matching' }
    this.rotate = { ru: 'коррекция наклона линии глаз', en: 'aligning the eyes horizontally' }
    this.referenceTilt = { ru: 'учитывать наклон головы образца', en: 'match reference head tilt' }
    this.dialogMode = { ru: 'интерактивная трансформация', en: 'interactive transform' }
    this.tileResize = { ru: 'ресайз слоя для детектора, px', en: 'resize layer for detector, px' }
    this.rotationRatio = { ru: 'коэффициент поворота', en: 'rotation ratio' }
    this.modeFace = { ru: 'Погрудный портрет', en: 'Head and shoulders' }
    this.modeHalf = { ru: 'Поколенный портрет', en: 'Half body portrait' }
    this.modeFull = { ru: 'Портрет в полный рост', en: 'Full body portrait' }
    var modeFaceDesc = {
        ru: 'Выравнивание по лицу. Размер рассчитывается по нескольким ориентирам лица с уменьшением влияния выбросов. Контур головы даёт только небольшую поправку',
        en: 'Face-based alignment. Scale uses several facial measurements with reduced outlier influence. Head contour provides only a small adjustment'
    },
        modeHalfDesc = {
            ru: 'Выравнивание по фигуре до уровня бёдер. Масштаб определяется по расстоянию от центра лица до линии бёдер. Подходит для средних планов, точность выравнивания лиц низкая',
            en: 'Body alignment up to hip level. Scale is calculated from midpoint of face to hip line distance. Suitable for medium shots, face alignment accuracy is low'
        },
        modeFullDesc = {
            ru: 'Выравнивание по всей фигуре. Размер рассчитывается от головы до нижней точки тела. Оптимально для портретов в полный рост, точность выравнивания лиц низкая',
            en: 'Full body alignment. Scale is calculated from head to the lowest body point. Ideal for full-height portraits, face alignment accuracy is low'
        };
    this.desc = [modeFaceDesc, modeHalfDesc, modeFullDesc]
    this.save = { ru: 'Сохранить настройки', en: 'Save settings' }
    this.silentMode = { ru: 'тихий режим (без сообщений об ошибках)', en: 'Silent mode (no error alerts)' }
}
function Config() {
    settingsObj = this
    this.auto = false
    this.move = true
    this.resize = true
    this.headSupport = true
    this.rotate = false
    this.referenceTilt = false
    this.angleRatio = 0.75
    this.detectSize = 1024
    this.dialogMode = false
    this.pose = false
    this.legs = false
    this.tile = true
    this.silentMode = false
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
        if (toAction) playbackParameters = d; else putCustomOptions(UUID, d, true);
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
