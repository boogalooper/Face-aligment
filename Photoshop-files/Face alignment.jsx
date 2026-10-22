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
// true: прежний путь — открыть подготовленный смарт-объект и сохранить JPEG.
// false или отсутствие константы: экспорт PSB без открытия содержимого.
const USE_LEGACY_JPEG = false;
const ver = 0.157,
    API_HOST = '127.0.0.1',
    API_PORT_SEND = 6350,
    API_PORT_LISTEN = 6351,
    API_FILE = 'face-detect-api',
    INIT_DELAY = 60000,
    DETECTION_DELAY = 60000,
    UUID = '7a4144e4-943e-4b5f-8d40-06dfc90b682b';
var fd = new faceApi(API_HOST, API_PORT_SEND, API_PORT_LISTEN, API_FILE),
    s2t = stringIDToTypeID,
    apl = new AM('application'),
    doc = new AM('document'),
    lr = new AM('layer'),
    str = new Locale(),
    cfg = new Config(),
    pendingPreviews = [],
    operationStage = 'Initialize';
isCancelled = false;
$.localize = true
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
function throwCancelled() {
    isCancelled = true;
    var e = new Error("Operation cancelled");
    e.number = 8007;
    throw e;
}
function validateInputDocument() {
    if(!apl.getProperty('numberOfDocuments')) return localize(str.errDoc);
    var mode=doc.getProperty('mode'), value=typeof mode=='string'?mode:(mode && mode.value);
    if(value!='RGBColor' && value!='RGBColorMode') return localize(str.errRGB);
    var depth=doc.getProperty('depth');
    if(depth!=8 && depth!=16 && depth!=32) return localize(str.errDepth);
    return null;
}
function main() {
    var inputError=validateInputDocument();
    if(inputError) {
        if(!cfg.silentMode) alert(inputError,localize(str.err));
        return;
    }
    try {
        var sourceDocument=app.activeDocument,
            docState=sourceDocument.activeHistoryState,
            targetLayers=getSelectedLayers(),
            originalSelection=targetLayers.slice(0), alignmentError=null;
        if (targetLayers.length > 1 && fd.init()) {
            if (targetLayers.length <= 2) getKeyPoints(targetLayers);
            else if (app.doProgressSegmentTask(targetLayers.length, 0, targetLayers.length * 2, "getKeyPoints(targetLayers)") === false) throwCancelled();
            if (isCancelled) throwCancelled();
            if (targetLayers[0] instanceof Object && targetLayers[0].measurement && targetLayers[0].measurement.middle) {
                sourceDocument.suspendHistory('Face alignment','applyAlignment()');
                if(alignmentError) throw alignmentError;
                if(isCancelled) throwCancelled();
            } else throw new Error(str.errBaseLayer)
        } else { throw new Error(str.errLr) }
    } catch (e) {
        var details=e.message+'\nStage: '+operationStage+(e.line?'\nLine: '+e.line:'');
        try {
            if (sourceDocument && docState) {
                app.activeDocument=sourceDocument;
                sourceDocument.suspendHistory('Face alignment','function historyBoundary() {}');
                sourceDocument.activeHistoryState=docState;
            }
        } catch(restoreError) {
            details+='\nHistory restore: '+restoreError.message;
        }
        if (!cfg.silentMode && !(e.number && e.number == 8007)) alert(details, str.err)
    } finally {
        cleanupPreviews();
        if(originalSelection && originalSelection.length) try {
            operationStage='Restore original layer selection';
            lr.selectLayers(originalSelection);
        } catch(restoreSelectionError) {$.writeln(restoreSelectionError.message);}
    }
    function applyAlignment() {
        // Finish the native history callback normally before reporting errors.
        try {
            var count=targetLayers.length;
            if(count<=2 || cfg.dialogMode) transformLayers(targetLayers,targetLayers.shift());
            else if(app.doProgressSegmentTask(count,count,count*2,
                'transformLayers(targetLayers, targetLayers.shift())')===false) throwCancelled();
        } catch(e) {alignmentError=e;}
    }
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
            if (!removePreview(path)) $.writeln('Face alignment: deferred preview cleanup: ' + path);
        }
    }
    pendingPreviews = [],
    operationStage = 'Initialize';
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
    var batch = fd.sendPayload('batch_begin', {auto:cfg.auto, pose:cfg.pose,
        legs:cfg.legs, head_support:!!(cfg.headSupport && cfg.resize)}),
        legacyJPEG=typeof USE_LEGACY_JPEG!='undefined' && USE_LEGACY_JPEG===true,
        records=[], originalIDs=lrs.slice(0), result,
        historyDocument=app.activeDocument, baseline=historyDocument.activeHistoryState,
        baselineLayerCount=doc.getProperty('numberOfLayers'),
        preparationError=null, preparationStage='', sourceDocID=doc.getProperty('documentID');
    try {
        if(!sourceDocID) throw new Error('Cannot read source document ID');
        // Capture all original measurements before changing any layer.
        for(var i=0;i<originalIDs.length;i++) {
            var id=originalIDs[i], o={
                bounds:lr.descToObject(lr.getProperty('boundsNoEffects',id).value),
                sourceKind:lr.getProperty('layerKind',id),
                name:lr.getProperty('name',id)};
            records.push(o);
        }
        try {
            // One temporary history transaction for the complete export batch.
            historyDocument.suspendHistory('Prepare layer previews','exportPreviews()');
        } catch(e) {
            preparationError=e; preparationStage=operationStage;
        } finally {
            operationStage='Restore original document after preview export';
            restoreBatch();
        }
        if(preparationError) {operationStage=preparationStage; throw preparationError;}
        operationStage='Wait for Python analysis';
        app.changeProgressText(operationStage);
        result=fd.sendPayload('batch_finish',{batch_id:batch});
        if(!result || !result.items || result.items.length!=originalIDs.length)
            throw new Error('Python returned an incomplete layer analysis batch');
        cfg.pose=result.pose; cfg.legs=result.legs;
        for(var i=0;i<originalIDs.length;i++) {
            operationStage='Map landmarks for layer ID '+originalIDs[i];
            var item=result.items[i], o=records[i];
            if(item.error) throw new Error('Layer '+lr.getProperty('name',originalIDs[i])+': '+item.error+
                (item.diagnostics?'\nDiagnostics: '+item.diagnostics:''));
            if(item.mesh) {
                // Map exported pixel coordinates through the new SO quadrilateral,
                // then undo only the temporary detector downscale.
                var mesh=item.mesh, q=o.quad, ratioX=(q[2]-q[0])/item.width/o.scale,
                    ratioY=(q[7]-q[1])/item.height/o.scale,
                    offsetX=o.cx+(q[0]-o.cx)/o.scale-o.bounds.left,
                    offsetY=o.cy+(q[1]-o.cy)/o.scale-o.bounds.top;
                if(!(isFinite(ratioX) && isFinite(ratioY) && ratioX>0 && ratioY>0 &&
                    isFinite(offsetX) && isFinite(offsetY)))
                    throw new Error('Invalid PSB coordinate mapping for layer '+originalIDs[i]);
                for(var key in mesh) if(mesh.hasOwnProperty(key) && key!='head') {
                    mesh[key][0]=mesh[key][0]*ratioX+offsetX;
                    mesh[key][1]=mesh[key][1]*ratioY+offsetY;
                }
                if(mesh.head) mesh.head.height*=Math.sqrt(Math.abs(ratioX*ratioY));
                calcDimensions(o,mesh);
                validateLandmarkGeometry(o);
                if(o.middle) lrs[i]=new convertToAbsolute(originalIDs[i],o);
            }
            if(i==0 && !o.middle) throw new Error(str.errBaseLayer);
        }
    } finally {
        try {fd.sendPayload('batch_abort',{batch_id:batch});} catch(ignore) {}
    }
    function exportPreviews() {
        // Let the host close the history transaction even after an error/cancel.
        try {
            for(var i=0;i<originalIDs.length;i++) {
                if(app.updateProgress(i,originalIDs.length)===false) throwCancelled();
                var id=originalIDs[i], o=records[i],
                    f=new File(Folder.temp+'/FD_'+sourceDocID+'_'+(new Date()).getTime()+
                        '_'+Math.floor(Math.random()*1000000)+(legacyJPEG?'.jpg':'.psb'));
                app.changeProgressText(localize(str.preparingLayer)+': '+o.name);
                operationStage='Prepare layer ID '+id;
                lr.selectLayers([id]);
                pendingPreviews.push(f.fsName);
                preparePreview(o,f);
                fd.sendPayload('batch_add',{batch_id:batch,index:i,path:f.fsName});
            }
        } catch(e) {preparationError=e; preparationStage=operationStage;}
    }
    function historyBoundary() {}
    function restoreBatch() {
        // Close the deferred native history boundary before restoring the source.
        app.activeDocument=historyDocument;
        historyDocument.suspendHistory('Prepare layer previews','historyBoundary()');
        historyDocument.activeHistoryState=baseline;
        if(!batchIsRestored())
            throw new Error('History did not restore the document after preview export');
    }
    function batchIsRestored() {
        if(doc.getProperty('numberOfLayers')!=baselineLayerCount) return false;
        for(var j=0;j<originalIDs.length;j++)
            if(!originalIsRestored(originalIDs[j],records[j])) return false;
        return true;
    }
    function originalIsRestored(sourceID,o) {
        // A successful layerKind lookup also confirms that the source ID exists.
        if(lr.getProperty('layerKind',sourceID)!=o.sourceKind) return false;
        var restored=lr.getProperty('boundsNoEffects',sourceID);
        if(!restored) return false;
        var bounds=lr.descToObject(restored.value), keys=['left','top','right','bottom'];
        for(var j=0;j<keys.length;j++)
            if(!isFinite(bounds[keys[j]]) || Math.abs(bounds[keys[j]]-o.bounds[keys[j]])>.001) return false;
        return true;
    }
    function preparePreview(o,f) {
        operationStage='Rasterize preview';
        if(lr.hasProperty('smartObject')) lr.rasterize();
        var b=lr.descToObject(lr.getProperty('boundsNoEffects').value),
            w=b.right-b.left, h=b.bottom-b.top;
        if(!(w>0 && h>0)) throw new Error('Empty layer bounds');
        o.cx=(b.left+b.right)/2; o.cy=(b.top+b.bottom)/2;
        o.scale=cfg.tile ? Math.min(1,cfg.detectSize/Math.min(w,h)) : 1;
        operationStage='Resize preview';
        if(o.scale<1) lr.resizePreview(o.scale);
        operationStage='Convert preview to Smart Object';
        lr.convertToSmartObject();
        var more=lr.getProperty('smartObjectMore').value,
            tr=more.getList(s2t('transform'));
        o.quad=[];
        for(var j=0;j<8;j++) o.quad.push(tr.getDouble(j));
        if(legacyJPEG) {
            var previewDocument=null;
            try {
                operationStage='Open prepared Smart Object';
                lr.editSmartObject();
                var openedID=doc.getProperty('documentID');
                if(!openedID || openedID==sourceDocID)
                    throw new Error('Cannot confirm the prepared Smart Object document');
                previewDocument=app.activeDocument;
                operationStage='Save JPEG preview';
                doc.prepareJPEG();
                doc.saveACopy(f);
                if(!f.exists || !f.length) throw new Error('JPEG save did not create a preview');
            } finally {
                // Edit Contents can open the child and then raise an error.
                if(!previewDocument) {
                    var currentID=doc.getProperty('documentID');
                    if(currentID && currentID!=sourceDocID) previewDocument=app.activeDocument;
                }
                if(previewDocument) {
                    try {
                        app.activeDocument=previewDocument;
                        doc.close(false);
                    } finally {app.activeDocument=historyDocument;}
                }
            }
        } else {
            operationStage='Export PSB preview';
            lr.exportSmartObject(f);
            if(!f.exists || !f.length) throw new Error('Smart object export did not create a PSB');
        }
    }
    function validateLandmarkGeometry(o) {
        var keys=['left','right','middle','bottom'];
        for(var j=0;j<keys.length;j++) {
            var p=o[keys[j]];
            if(!p || !isFinite(p[0]) || !isFinite(p[1]))
                throw new Error('Landmark geometry contains invalid coordinates');
        }
        if(o.left[0]==o.right[0] && o.left[1]==o.right[1])
            throw new Error('Landmark geometry has zero face width');
        if(cfg.pose && o.bottom[0]==o.middle[0] && o.bottom[1]==o.middle[1])
            throw new Error('Landmark geometry has zero body height');
    }
    function calcDimensions(o, mesh) {
        try {
            var fp=null, bp=null;
            if(cfg.pose) {
                fp=findPairPoints(mesh,[[5,2],[6,3],[4,1],[8,7],[0,0],[10,9]]);
                bp=findPairPoints(mesh,cfg.legs?[[28,27],[26,25],[32,31],[30,29]]:[[24,23],[26,25]]);
                if(!fp || !bp) throw new Error('Required body landmark pairs are missing');
            }
            var left=mesh[cfg.pose?fp[0]:33], right=mesh[cfg.pose?fp[1]:263];
            o.left=[left[0],left[1]];
            o.right=[right[0],right[1]];
            if(cfg.pose) {
                o.bottom=getMidpoint(mesh[bp[0]],mesh[bp[1]]);
                o.middle=getMidpoint(o.left,o.right);
            } else {
                o.metrics=faceMetrics(mesh);
                o.bottom=[mesh[152][0],mesh[152][1]];
                o.middle=getMidpoint(mesh[127],mesh[356]);
            }
        } catch(e) {throw new Error('Landmark geometry: '+e.message);}
    }
    function findPairPoints(mesh,pairs) {
        for(var i=0;i<pairs.length;i++)
            if(mesh[pairs[i][0]] && mesh[pairs[i][1]]) return pairs[i];
        return null;
    }
    function getMidpoint(a,b) {return [(a[0]+b[0])/2,(a[1]+b[1])/2];}
    function convertToAbsolute(id, points) {
        this.id = id
        this.angle = Math.atan2(points.right[1] - points.left[1], points.right[0] - points.left[0]) * 180 / Math.PI
        if(cfg.pose) this.height = Math.sqrt(Math.pow(points.bottom[0] - points.middle[0], 2) + Math.pow(points.bottom[1] - points.middle[1], 2))
        this.measurement = points
        this.metrics = points.metrics;
        points.middle[0] += points.bounds.left
        points.middle[1] += points.bounds.top

    }
}
// Distances are rotation-invariant and measured before adding layer offsets.
function faceMetrics(mesh) {
    function point(i) {
        var p = mesh[i];
        return p && isFinite(p[0]) && isFinite(p[1]) ? [p[0],p[1]] : null;
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
        head: mesh.head && mesh.head.quality >= .8 && isFinite(mesh.head.height) ? mesh.head.height : 0
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
        slice = 1 / (targetLayers.length);
    operationStage='Align layers';
    app.changeProgressText(operationStage);
    for (var i = 0; i < len; i++) {
        var text = "Align layer: " + lr.getProperty("name", targetLayers[i].id);
        if (app.doProgressTask(slice, "workChunk(text, targetLayers, baseLayer, i)") === false) throwCancelled();
    }
    function normalizeAngle(angle) {
        while (angle > 180) angle -= 360;
        while (angle < -180) angle += 360;
        return angle;
    }
    function workChunk(text, targetLayers, baseLayer, i) {
        if (targetLayers[i] instanceof Object && targetLayers[i].measurement && targetLayers[i].measurement.middle) {
            operationStage='Align layer ID '+targetLayers[i].id;
            app.changeProgressText(text);
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
function AM(target) {
    var s2t = stringIDToTypeID,
        t2s = typeIDToStringID,
        AR = ActionReference,
        AD = ActionDescriptor;
    target = target ? s2t(target) : null;
    this.getProperty = function (property, id) {
        property = s2t(property);
        (r = new AR).putProperty(s2t('property'), property);
        id != undefined ? r.putIdentifier(target, id) :
            r.putEnumerated(target, s2t('ordinal'), s2t('targetEnum'));
        try { return getDescValue(executeActionGet(r), property) } catch (e) { return false };
    }
    this.hasProperty = function (property) {
        property = s2t(property);
        (r = new AR).putProperty(s2t('property'), property);
        r.putEnumerated(target, s2t('ordinal'), s2t('targetEnum'));
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
    this.resizePreview = function (scale) {
        var d=new AD, r=new AR, offset=new AD;
        r.putEnumerated(s2t('layer'),s2t('ordinal'),s2t('targetEnum'));
        d.putReference(s2t('null'),r);
        d.putEnumerated(s2t('freeTransformCenterState'),s2t('quadCenterState'),s2t('QCSAverage'));
        offset.putUnitDouble(s2t('horizontal'),s2t('pixelsUnit'),0);
        offset.putUnitDouble(s2t('vertical'),s2t('pixelsUnit'),0);
        d.putObject(s2t('offset'),s2t('offset'),offset);
        d.putUnitDouble(s2t('width'),s2t('percentUnit'),scale*100);
        d.putUnitDouble(s2t('height'),s2t('percentUnit'),scale*100);
        d.putEnumerated(s2t('interfaceIconFrameDimmed'),s2t('interpolationType'),s2t('nearestNeighbor'));
        executeAction(s2t('transform'),d,DialogModes.NO);
    };
    this.exportSmartObject = function (file) {
        var d=new AD, previousDialogs=app.displayDialogs;
        d.putPath(s2t('null'),file);
        try {
            app.displayDialogs=DialogModes.NO;
            executeAction(s2t('placedLayerExportContents'),d,DialogModes.NO);
        } finally {
            app.displayDialogs=previousDialogs;
        }
    };
    this.editSmartObject = function () {
        executeAction(s2t('placedLayerEditContents'), undefined, DialogModes.NO);
    };
    this.prepareJPEG = function () {
        // Convert only the opened disposable preview; source pixels are restored.
        var mode=this.getProperty('mode'), value=typeof mode=='string'?mode:(mode && mode.value);
        if(value!='RGBColor' && value!='RGBColorMode') {
            var descriptor=new AD;
            descriptor.putClass(s2t('to'),s2t('RGBColorMode'));
            executeAction(s2t('convertMode'),descriptor,DialogModes.NO);
        }
        if(this.getProperty('depth')!=8) {
            var descriptor=new AD;
            descriptor.putInteger(s2t('depth'),8);
            descriptor.putBoolean(s2t('merge'),false);
            executeAction(s2t('convertMode'),descriptor,DialogModes.NO);
        }
    };
    this.saveACopy = function (file) {
        var options=new AD, descriptor=new AD;
        options.putInteger(s2t('extendedQuality'),6);
        options.putEnumerated(s2t('matteColor'),s2t('matteColor'),s2t('none'));
        descriptor.putObject(s2t('as'),s2t('JPEG'),options);
        descriptor.putPath(s2t('in'),file);
        descriptor.putBoolean(s2t('copy'),true);
        executeAction(s2t('save'),descriptor,DialogModes.NO);
    };
    this.convertToSmartObject = function () {
        executeAction(s2t('newPlacedLayer'), undefined, DialogModes.NO)
    }


    this.selectLayers = function (ids) {
        // One layer per ActionReference: additional IDs use addToSelection.
        // Never build a nested reference chain from several sibling layers.
        var seen={}, index=0;
        for(var i=0;i<ids.length;i++) {
            var id=ids[i];
            if(typeof id!='number' || !isFinite(id) || id<=0 || Math.floor(id)!=id)
                throw new Error('Invalid layer ID at '+operationStage+': '+id);
            if(seen[id]) continue;
            seen[id]=true;
            var reference=new AR, descriptor=new AD;
            reference.putIdentifier(s2t('layer'),id);
            descriptor.putReference(s2t('null'),reference);
            if(index>0) descriptor.putEnumerated(s2t('selectionModifier'),
                s2t('selectionModifierType'),s2t('addToSelection'));
            descriptor.putBoolean(s2t('makeVisible'),true);
            try {
                executeAction(s2t('select'),descriptor,DialogModes.NO);
            } catch(e) {
                if(e.number==8007) throw e;
                throw new Error('Select layer ID '+id+' at '+operationStage+': '+e.message);
            }
            index++;
        }
    };
    this.close = function (save) {
        save = save != true ? s2t("no") : s2t("yes");
        (d = new AD).putEnumerated(s2t("saving"), s2t("yesNo"), save);
        executeAction(s2t("close"), d, DialogModes.NO);
    }



    this.transform = function (scale, cX, cY, angle, dialogMode) {
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
        serverID='face-alignment/0.157';
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
        var w=new Window('palette','Face alignment — установка Python'), cancel, stopped=false,
            start=(new Date()).getTime();
        w.add('statictext',undefined,'Завершите установку в открывшемся окне.');
        cancel=w.add('button',undefined,'Закрыть ожидание');
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
        if(result) throw new Error('An older Face alignment server is running. Wait 15 minutes without using the script, or stop its pythonw.exe process, then try again.');
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
        var file=new File(folder.fsName+'/lib/'+name+'.pyw');
        return file.exists?file:null;
    }
    this.cleanup=function(path) {
        return sendMessage({type:'cleanup',message:path},1500);
    };
    this.sendPayload=function(type,payload) {
        var result=sendMessage({type:type,message:payload},type=='batch_finish'?15*60*1000:DETECTION_DELAY);
        if(!result) throw new Error(str.errDetectionTimeout);
        if(result.server_id!=serverID) throw new Error('Unexpected detection server.');
        if(result.type=='cancelled') throwCancelled();
        if(result.type=='error') throw new Error(result.message);
        return result.type=='answer'?result.message:null;
    };
    function controlRequest(type,targetID,waitReply) {
        var socket = new Socket();
        try {
            socket.timeout = waitReply ? 6 : 1;
            if (!socket.open(apiHost+':'+portSend,'UTF-8')) return false;
            socket.writeln(objectToJSON({type:type,target_id:targetID}));
            if (!waitReply) return true;
            var result = eval('('+socket.readln()+')');
            return result && result.stopped === true;
        } catch(e) { return false; }
        finally { try {socket.close();} catch(e) {} }
    }
    function sendMessage(o,delay) {
        o.request_id=session+'-'+(++sequence);
        var listener=new Socket(),sender=new Socket(),
            detection=o.type=='batch_finish', sent=false, received=false;
        if(!listener.listen(portListen,'UTF-8')) throw new Error('Response port '+portListen+' is busy.');
        try {
            sender.timeout=1;
            if(!sender.open(apiHost+':'+portSend,'UTF-8')) return null;
            // Mark before writing: a partial/failed send may still reach the server.
            sent=true;
            sender.writeln(objectToJSON(o));sender.close();
            var start=(new Date()).getTime(), lastPulse=start, lastHeartbeat=start;
            while((new Date()).getTime()-start<delay) {
                var now=(new Date()).getTime();
                if(detection && now-lastPulse>=100) {
                    lastPulse=now;
                    if(app.updateProgress(0,1)===false) throwCancelled();
                }
                if(detection && now-lastHeartbeat>=1000) {
                    lastHeartbeat=now;
                    controlRequest('heartbeat',o.request_id,false);
                }
                var answer=listener.poll();
                if(answer) {
                    var parsed=null;
                    try {answer.timeout=5; var body='', part; while(!answer.eof) {part=answer.read(65536); if(!part) break; body+=part; if(body.indexOf('\n')>=0) break;} parsed=eval('('+body+')');} catch(e) {} finally {answer.close();}
                    if(parsed && parsed.request_id==o.request_id) { received=true;return parsed; }
                }
                $.sleep(5);
            }
            return null;
        } catch(e) {
            if(e.number==8007) isCancelled=true;
            throw e;
        } finally {
            try{sender.close();}catch(e){}
            listener.close();
            if(detection && sent && !received) {
                if(!controlRequest('cancel',o.request_id,true))
                    $.writeln('Face alignment: cancellation not acknowledged; server heartbeat/deadline watchdog remains active.');
            }
        }
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
    this.errRGB = { ru: 'Для анализа нужен документ в режиме RGB. Выберите Изображение → Режим → RGB и повторите запуск. Скрипт не изменял документ.', en: 'Analysis requires an RGB document. Choose Image > Mode > RGB Color and run again. The document has not been changed.' }
    this.errDepth = { ru: 'Поддерживается RGB с глубиной 8, 16 или 32 бита на канал. Проверьте Изображение → Режим. Скрипт не изменял документ.', en: 'RGB with 8, 16 or 32 bits per channel is required. Check Image > Mode. The document has not been changed.' }
    this.errLr = { ru: '2 и более слоя должны быть выбраны: нижний слой является образцом размера лица. Слои должны быть незаблокированными!', en: 'Two or more layers must be selected: the bottom layer is the face size sample. The layers must be unlocked!' }
    this.errModule = { ru: 'Модуль ' + API_FILE + '.pyw не найден в папке lib!', en: 'Module ' + API_FILE + '.pyw not found in the lib folder!' }
    this.errDetectionTimeout = { ru: 'Превышено время ожидания ответа детектора', en: 'Detector response timeout' }
    this.errBaseLayer = { ru: 'Ключевые точки не найдены на нижнем слое!', en: 'Key points not found on bottom layer!' }
    this.preparingLayer = { ru: 'Подготовка слоя', en: 'Preparing layer' }
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
    var settingsObj = this
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
        var d = objectToDescriptor(settingsObj)
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
