import '../styles/gerber.css';
import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { BarChart3, CircuitBoard, Download, Expand, FolderOpen, Maximize, Minimize2, Minus, Plus, X } from 'lucide-react';
import { ToolPage } from '../components/ToolPage';
import { Button } from '../components/shadcn/button';
import { Notes, NumField, Panel, Section, Segmented } from '../components/ui';
import { GerberCopperAnalysis } from '../components/GerberCopperAnalysis';
import { GerberCanvas, type GerberCanvasApi, type GerberView } from '../components/GerberCanvas';
import { gerberLayerLabel, readGerberInputs, type GerberLayer } from '../lib/gerber';
import { parseGerberInputs } from '../lib/gerberWorker';
import { GERBER_EXAMPLE_A, GERBER_EXAMPLE_B } from '../lib/gerberExample';
import { downloadBlob } from '../lib/resultImage';

type Side='A'|'B';
type Workflow='inspect'|'compare';
interface Layout { name:string;layers:GerberLayer[];warnings:string[] }
const empty=():Layout=>({name:'',layers:[],warnings:[]});
const NO_LAYERS:GerberLayer[]=[];
// Volatile tab memory only: no filenames, SVGs or board files enter URL, analytics or browser storage.
let session:{A:Layout;B:Layout;dx:number;dy:number;mode:GerberView;workflow:Workflow}={A:empty(),B:empty(),dx:0,dy:0,mode:'overlay',workflow:'inspect'};
const COLORS=['#d08a3c','#3d8fe0','#6cc28c','#e07fb0','#c9a227','#b07ad8','#4ab3b3'];

export default function GerberViewer(){
  const [layouts,setLayouts]=useState({A:session.A,B:session.B});
  const [workflow,setWorkflow]=useState<Workflow>(session.workflow);
  const compareWorkflow=workflow==='compare';
  const [mode,setMode]=useState<GerberView>(session.mode),[dx,setDx]=useState(session.dx),[dy,setDy]=useState(session.dy);
  const [fullscreen,setFullscreen]=useState(false),[viewBusy,setViewBusy]=useState(false),[analysisOpen,setAnalysisOpen]=useState(false);
  const workspace=useRef<HTMLDivElement>(null),fullscreenButton=useRef<HTMLButtonElement>(null),nativeFullscreen=useRef(false);
  const [loading,setLoading]=useState<Record<Side,string>>({A:'',B:''});
  const [error,setError]=useState(''),[resolution,setResolution]=useState(0),[fitKey,setFitKey]=useState(1);
  const canvas=useRef<GerberCanvasApi>(null),controllers=useRef<Partial<Record<Side,AbortController>>>({});
  const inputA=useRef<HTMLInputElement>(null),inputB=useRef<HTMLInputElement>(null);
  const id=useId();
  useEffect(()=>{session={...layouts,dx,dy,mode,workflow};},[layouts,dx,dy,mode,workflow]);
  useEffect(()=>{const active=controllers.current;return()=>{active.A?.abort();active.B?.abort();};},[]);
  const exitFullscreen=useCallback(()=>{
    if(document.fullscreenElement===workspace.current)void document.exitFullscreen().catch(()=>{});
    nativeFullscreen.current=false;setFullscreen(false);
  },[]);
  const toggleFullscreen=async()=>{
    if(fullscreen){exitFullscreen();return;}
    setFullscreen(true);
    const element=workspace.current;
    if(element?.requestFullscreen){
      nativeFullscreen.current=true;
      try{await element.requestFullscreen();}catch{nativeFullscreen.current=false;} // Expanded workspace also works when the browser disallows native fullscreen.
    }
  };
  useEffect(()=>{
    const element=workspace.current;
    const changed=()=>{if(nativeFullscreen.current&&document.fullscreenElement!==element){nativeFullscreen.current=false;setFullscreen(false);}};
    document.addEventListener('fullscreenchange',changed);
    return()=>{document.removeEventListener('fullscreenchange',changed);if(document.fullscreenElement===element)void document.exitFullscreen().catch(()=>{});};
  },[]);
  useEffect(()=>{
    if(!fullscreen)return;
    const previous=document.activeElement as HTMLElement|null;
    fullscreenButton.current?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();exitFullscreen();return;}
      if(event.key!=='Tab')return;
      const controls=Array.from(workspace.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')??[]).filter(element=>element.getClientRects().length>0);
      const first=controls[0],last=controls.at(-1);if(!first||!last)return;
      if(!workspace.current?.contains(document.activeElement)){event.preventDefault();first.focus();}
      else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('keydown',key);previous?.focus();};
  },[fullscreen,exitFullscreen]);
  const load=useCallback(async(side:Side,files:File[])=>{
    if(!files.length)return;
    controllers.current[side]?.abort();const controller=new AbortController();controllers.current[side]=controller;
    setLoading(state=>({...state,[side]:'Reading files...'}));setError('');
    try{
      const {inputs,warnings}=await readGerberInputs(files,controller.signal);
      const labels=new Map(inputs.map(file=>[file.name,gerberLayerLabel(file.name,new TextDecoder().decode(file.data.subarray(0,16000)))]));
      const parsed=await parseGerberInputs(inputs,controller.signal,(done,total)=>setLoading(state=>({...state,[side]:'Reading layer '+done+' of '+total+'...'})));
      if(controller.signal.aborted)return;
      if(!parsed.layers.length)throw new Error(parsed.errors.join(' ')||'No drawable Gerber layers found.');
      const stamp=crypto.randomUUID();
      setLayouts(current=>{
        const matching=side==='B'?new Set(current.A.layers.filter(l=>l.visible).map(l=>l.label)):new Set<string>();
        const labelled=parsed.layers.map((layer,index)=>({...layer,id:side+'-'+stamp+'-'+index,label:labels.get(layer.name)??gerberLayerLabel(layer.name),visible:false,color:COLORS[(index+(side==='B'?1:0))%COLORS.length]}));
        const preferred=labelled.find(l=>matching.has(l.label))??labelled.find(l=>/Top copper|Copper.*Top/i.test(l.label))??labelled[0];
        return {...current,[side]:{name:files.length===1?files[0].name:files.length+' files',layers:labelled.map(l=>({...l,visible:l===preferred})),warnings:[...warnings,...parsed.errors,...parsed.layers.flatMap(l=>l.warnings.map(w=>l.name+': '+w))]}};
      });
      if(side==='B'){setDx(0);setDy(0);}setFitKey(key=>key+1);
    }catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:'Could not open layout.');}
    finally{if(controllers.current[side]===controller)setLoading(state=>({...state,[side]:''}));}
  },[]);
  const clear=(side:Side)=>{controllers.current[side]?.abort();setLayouts(current=>({...current,[side]:empty()}));if(side==='B'){setDx(0);setDy(0);}setError('');};
  const reset=()=>{controllers.current.A?.abort();controllers.current.B?.abort();setLayouts({A:empty(),B:empty()});setDx(0);setDy(0);setMode('overlay');setWorkflow('inspect');setAnalysisOpen(false);setError('');};
  const updateLayer=(side:Side,id:string,update:Partial<GerberLayer>)=>setLayouts(current=>({...current,[side]:{...current[side],layers:current[side].layers.map(l=>l.id===id?{...l,...update}:l)}}));
  const selectAll=(side:Side,visible:boolean)=>setLayouts(current=>({...current,[side]:{...current[side],layers:current[side].layers.map(l=>({...l,visible}))}}));
  const input=(side:Side)=><input id={id+'-'+side} ref={side==='A'?inputA:inputB} type="file" tabIndex={-1} multiple className="sr-only" aria-label={'Open layout '+side+' files'}
    onChange={(event:ChangeEvent<HTMLInputElement>)=>{void load(side,Array.from(event.target.files??[]));event.target.value='';}} />;
  const upload=(side:Side)=><div className="gerber-upload" onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();void load(side,Array.from(event.dataTransfer.files));}}>
    {input(side)}<div className="gerber-upload-heading"><span className={'gerber-side-badge gerber-side-'+side}>{side}</span><div><strong>{compareWorkflow?'Layout '+side: 'Your board'}</strong><p>{layouts[side].name||'Drop Gerber files or a ZIP archive'}</p></div></div>
    <div className="gerber-upload-actions"><Button variant="outline" size="sm" disabled={!!loading[side]} onClick={()=>(side==='A'?inputA:inputB).current?.click()}><FolderOpen size={14}/>{layouts[side].layers.length?'Replace layout':'Open files'}</Button>
      {(layouts[side].layers.length>0||loading[side])&&<Button variant="ghost" size="sm" onClick={()=>clear(side)} aria-label={'Clear layout '+side}><X size={14}/>{loading[side]?'Cancel':'Clear'}</Button>}</div>
    <p className="gerber-import-status" role="status">{loading[side]|| (layouts[side].layers.length?layouts[side].layers.filter(l=>l.visible).length+' of '+layouts[side].layers.length+' layers shown':'Choose one layer, several layers, or a complete set.')}</p>
  </div>;
  const layerList=(side:Side)=><Section title={'Layout '+side+' layers'}>
    {!layouts[side].layers.length?<p className="text-faint">Open layout {side} to choose its visible layers.</p>:<>
      <div className="gerber-selection-actions"><button className="btn" onClick={()=>selectAll(side,true)}>Show all</button><button className="btn" onClick={()=>selectAll(side,false)}>Hide all</button></div>
      <div className="gerber-layer-list">{layouts[side].layers.map(layer=><div className="gerber-layer-row" key={layer.id}>
        <label><input type="checkbox" checked={layer.visible} onChange={event=>updateLayer(side,layer.id,{visible:event.target.checked})} /><span><strong>{layer.label}</strong><small title={layer.name}>{layer.name}</small></span></label>
        <input type="color" value={layer.color} aria-label={'Colour of layout '+side+' '+layer.name} title="Layer colour in Layers view" onChange={event=>updateLayer(side,layer.id,{color:event.target.value})}/>
      </div>)}</div>
    </>}
  </Section>;
  const activeB=compareWorkflow?layouts.B.layers:NO_LAYERS;
  const viewMode=compareWorkflow?mode:'layers';
  const selectedA=layouts.A.layers.filter(l=>l.visible),selectedB=activeB.filter(l=>l.visible);
  const comparing=selectedA.length>0&&selectedB.length>0;
  const properties=<>{layerList('A')}{compareWorkflow&&layerList('B')}{compareWorkflow&&layouts.B.layers.length>0&&<Section title="Align layout B">
    <NumField label="Shift B in X" value={dx} onChange={setDx} unit="mm" allowNegative hint="Positive X moves B right. Original file coordinates are preserved until you change this."/>
    <NumField label="Shift B in Y" value={dy} onChange={setDy} unit="mm" allowNegative hint="Positive Y moves B up, following PCB coordinates. Bottom layers are not automatically mirrored."/>
    <Button size="sm" variant="outline" disabled={!dx&&!dy} onClick={()=>{setDx(0);setDy(0);}}>Reset alignment</Button>
    <p className="text-faint">Use the same export origin for both revisions. Fit changes only the view; it does not align or move either board.</p>
  </Section>}<Section title="Files and privacy" defaultOpen={false}><p className="text-faint">Files are read on this device and kept in this tab's memory. Reloading clears them. Files are not uploaded or included in shared URLs. Up to 64 layers / 40 MiB expanded per layout, 8 MiB per layer and 25 MiB per ZIP.</p></Section></>;
  const sample=async()=>{await load('A',GERBER_EXAMPLE_A.map(f=>new File([f.text],f.name)));if(compareWorkflow)await load('B',GERBER_EXAMPLE_B.map(f=>new File([f.text],f.name)));};
  const exportImage=()=>{
    const source=canvas.current?.image();if(!source)return;
    const output=document.createElement('canvas');output.width=source.width;output.height=source.height+180;
    const ctx=output.getContext('2d');if(!ctx)return;ctx.fillStyle='#15191e';ctx.fillRect(0,0,output.width,output.height);ctx.fillStyle='#f0f0f0';ctx.font='20px sans-serif';ctx.fillText('PCB Planner - Gerber '+(comparing?'comparison':'inspection'),20,30,output.width-40);
    ctx.font='13px sans-serif';ctx.fillStyle='#b7c1cc';ctx.fillText('A: '+(selectedA.map(l=>l.name).join(', ')||'none'),20,54,output.width-40);ctx.fillText('B: '+(selectedB.map(l=>l.name).join(', ')||'none'),20,76,output.width-40);
    ctx.drawImage(source,0,90);ctx.fillText(comparing&&viewMode!=='layers'?'Orange: A only | Blue: B only | Grey: common (hidden in Differences)':'Layer colours as selected in the layer lists',20,source.height+116,output.width-40);
    ctx.fillText('Visual review at '+resolution.toFixed(2)+' um/pixel'+(compareWorkflow?' | B offset X '+dx+' mm, Y '+dy+' mm':''),20,source.height+139,output.width-40);ctx.fillText('Verify fabrication data with your manufacturer - pcbplanner.com/gerber-viewer',20,source.height+160,output.width-40);
    output.toBlob(blob=>{if(blob)downloadBlob(blob,'pcbplanner-gerber-'+(comparing?'comparison':'view')+'.png');},'image/png');
  };
  const warnings=[...layouts.A.warnings.map(w=>'A: '+w),...(compareWorkflow?layouts.B.warnings.map(w=>'B: '+w):[])];
  return <ToolPage focusView title="Gerber Viewer & Compare" description="Inspect one PCB layout or compare two revisions. Open Gerber files or ZIP archives, select layers independently, and highlight geometry present only in A or B. Files stay on your device." properties={fullscreen?undefined:properties} onReset={reset}
    reportBusy={!!loading.A || !!loading.B || viewBusy}
    status={loading.A||loading.B||(comparing?'Comparing selected layers':'Gerber inspection')+' - '+(selectedA.length+selectedB.length)+' visible layers'} method={<Method/>}>
    <div className="tool-task-picker" role="group" aria-label="Gerber task">
      <Button type="button" variant={!compareWorkflow?'default':'outline'} aria-pressed={!compareWorkflow} onClick={()=>{setWorkflow('inspect');setFitKey(key=>key+1);}}>Inspect one board</Button>
      <Button type="button" variant={compareWorkflow?'default':'outline'} aria-pressed={compareWorkflow} onClick={()=>{setWorkflow('compare');setFitKey(key=>key+1);}}>Compare revisions</Button>
      <p className="text-muted">{compareWorkflow?'Open revisions A and B, then select matching layers to compare.': 'Open a board and choose the layers you want to inspect.'}{!compareWorkflow&&layouts.B.layers.length>0&&' Revision B is kept for when you return to Compare revisions.'}</p>
    </div>
    <div className={`gerber-upload-grid ${compareWorkflow?'':'gerber-upload-single'}`}>{upload('A')}{compareWorkflow&&upload('B')}</div>
    <Notes kind="error" items={error?[error]:[]}/>
    <div ref={workspace} className={fullscreen?'gerber-fullscreen-workspace':undefined} role={fullscreen?'dialog':undefined} aria-modal={fullscreen?true:undefined} aria-label={fullscreen?'Fullscreen Gerber workspace':undefined}>
    <Panel className="gerber-board-panel" title={analysisOpen?'Copper distribution':'Board view'} right={<div className="gerber-board-actions"><Button size="sm" variant={analysisOpen?'secondary':'ghost'} aria-pressed={analysisOpen} onClick={()=>setAnalysisOpen(value=>!value)}><BarChart3 size={14}/><span>{analysisOpen?'Back to viewer':'Copper analysis'}</span></Button><Button ref={fullscreenButton} size="sm" variant="ghost" aria-label={fullscreen?'Exit fullscreen':'Enter fullscreen'} onClick={()=>void toggleFullscreen()}>{fullscreen?<Minimize2 size={14}/>:<Expand size={14}/>}<span>{fullscreen?'Exit fullscreen':'Fullscreen'}</span></Button><Button size="sm" variant="ghost" disabled={analysisOpen||viewBusy||!selectedA.length&&!selectedB.length} onClick={exportImage}><Download size={14}/>PNG</Button></div>}>
      <div className="gerber-analysis-container" hidden={!analysisOpen}><GerberCopperAnalysis key={[...layouts.A.layers,...activeB].map(layer=>layer.id).join('|')} a={layouts.A.layers} b={activeB}/></div>
      <div className="gerber-inspection" hidden={analysisOpen}>
      <div className="gerber-view-toolbar">{compareWorkflow?<Segmented label="Gerber view mode" value={mode} onChange={setMode} options={[{value:'layers',label:'Layers'},{value:'overlay',label:'Overlay'},{value:'differences',label:'Differences only'}]}/>:<span className="font-semibold text-muted">Board layers</span>}
        <div className="gerber-zoom-actions"><Button size="icon-sm" variant="outline" aria-label="Zoom out" onClick={()=>canvas.current?.zoom(.8)}><Minus size={15}/></Button><Button size="icon-sm" variant="outline" aria-label="Zoom in" onClick={()=>canvas.current?.zoom(1.25)}><Plus size={15}/></Button><Button size="sm" variant="outline" onClick={()=>canvas.current?.fit()}><Maximize size={14}/>Fit</Button></div>
      </div>
      {!layouts.A.layers.length&&!activeB.length&&<div className="gerber-start"><CircuitBoard size={20}/><p>{compareWorkflow?'Highlight changes between revisions.':'Inspect the layers of a sample board.'}</p><Button size="sm" variant="outline" disabled={!!loading.A||!!loading.B} onClick={()=>void sample()}>{compareWorkflow?'Try sample comparison':'Try sample board'}</Button></div>}
      <GerberCanvas ref={canvas} a={layouts.A.layers} b={activeB} dx={compareWorkflow?dx:0} dy={compareWorkflow?dy:0} mode={viewMode} fitKey={fitKey} fill={fullscreen} onResolution={setResolution} onError={setError} onBusy={setViewBusy}/>
      <div className="gerber-view-footer"><div className="gerber-legend">{comparing&&viewMode!=='layers'?<><span><i style={{background:'#d08a3c'}}/>A only</span><span><i style={{background:'#3d8fe0'}}/>B only</span>{viewMode==='overlay'&&<span><i style={{background:'#7d8791'}}/>Common</span>}</>:<span>Individual layer colours</span>}</div><span>{resolution>0?resolution.toFixed(2)+' µm / pixel':'Open layers to begin'} · Drag to pan; wheel or pinch to zoom</span></div>
      </div>
    </Panel>
    {fullscreen&&<aside className="gerber-fullscreen-layers" aria-label="Gerber layers"><div className="gerber-fullscreen-layer-heading">Layers and alignment</div>{properties}</aside>}
    </div>
    <p className="gerber-review-note">{comparing?'Overlay and Differences compare the combined image of the selected A layers against the selected B layers. Select corresponding layers for a revision check.':compareWorkflow?'Open both revisions and select corresponding layers in Properties to compare them.':'Select layers in Properties. Choose Compare revisions to inspect changes against a second layout.'} This is a visual review at the displayed resolution: zoom in to inspect smaller changes. It does not check connectivity, clearances or manufacturability.</p>
    {warnings.length>0&&<details className="gerber-import-warnings"><summary>Import notes ({warnings.length})</summary><ul>{warnings.slice(0,80).map((warning,index)=><li key={index}>{warning}</li>)}</ul></details>}
  </ToolPage>;
}
export function Method(){return <>
  <h2>Inspect one layout or compare two revisions</h2><p>Choose Inspect one board to open a single layout, or Compare revisions to open layouts A and B. Switching tasks keeps both revisions and their settings in this tab; inspection displays only A. Open individual Extended Gerber layers, several selected files, or a ZIP containing layers. Each layout has its own visibility checkboxes and layer colours under Properties. The initial selection favours top copper; filenames, legacy image names and available X2 FileFunction attributes help identify layers, but you choose which layers to compare.</p>
  <h3>How the colours are calculated</h3><p>Layers view draws the selected files in their individual colours. With at least one selected layer in both A and B, Overlay shows common geometry in grey, A-only geometry in orange and B-only geometry in blue. Differences only hides the common geometry. Each side is the union of its selected layer images: an overlap between different selected layers can hide a change, so compare matching layers when reviewing revisions. This compares rendered geometry, not file text, netlists or electrical intent.</p>
  <h3>Fullscreen and movement</h3><p>Fullscreen expands the board view together with its layer and alignment controls. Escape or Exit fullscreen returns to the normal workspace and keeps your selections. On narrow screens the controls sit below the board. Dragging and wheel or pinch zoom use a lightweight preview; the original artwork is redrawn after movement stops. PNG export becomes available when that detailed frame is ready.</p>
  <h3>Coordinates and resolution</h3><p>Gerber units are normalised to millimetres and original coordinate origins are preserved. No independent centring, automatic rotation or bottom-layer mirroring is applied. Positive B X moves right; positive B Y moves up. Fit only changes the camera. The selected geometries are rasterised on one shared viewport pixel grid, then compared at a 50 % coverage threshold. Anti-aliasing and the displayed pixel size limit the smallest visible change; zoom in and inspect the original layers before drawing conclusions.</p>
  <h3>Copper distribution</h3><p>Copper analysis measures each chosen copper layer within a closed board profile. Profile strokes are interpreted as contour centre lines; enclosed cutouts are excluded using even-odd nesting. Open, branching, overlapping or crossing contours are rejected. Choose a dedicated contour or region profile without dimensions, aperture flashes, repeats or polarity masks. Circular arcs are flattened with at most 2 µm chord error.</p><p>Coverage is the projected copper area inside the profile divided by board area, multiplied by 100. Original composited copper artwork is sampled on a fixed physical grid, including clearances and overlaps. Alpha-weighted boundary samples estimate area; Standard requests 50 µm pixels and Fine requests 25 µm. Large boards use a coarser grid to stay within 8 million pixels and 8192 pixels per side; the actual resolution is shown. Small features below that resolution may be missed. Colours, visible layers, viewport zoom and layout B alignment do not affect these measurements. Drill files are not automatically subtracted. Compare corresponding layers explicitly; a coverage difference is reported in percentage points and each revision uses its own profile area.</p>
  <h3>Supported input and import notes</h3><p>The viewer uses the MIT-licensed tracespace gerber-to-svg renderer for Extended Gerber paths, flashes, standard apertures, aperture macros, regions, clear/dark polarity and step-and-repeat. X2 attributes and legacy image names are used as labels where present. Older image-name and layer-name comments, default image transforms and positive-polarity declarations are accepted. Combined format/unit headers are normalised. Gerber job manifests contain metadata and are skipped when selecting artwork. Aperture blocks, non-default image transforms and negative-image files remain unsupported. Drill input supports decimal coordinates, FILE_FORMAT comments, KiCad FORMAT comments and unit-line zero patterns; units and precision are not guessed. Unsupported or invalid layers are reported in Import notes, while successfully read layers remain available.</p>
  <p>Gerber and drill artwork are separate layers here: drill holes are not automatically subtracted from copper. Mask layers show the exported mask artwork, not a reconstructed finished board. A displayed image is not a fabrication approval or an exhaustive format-conformance check.</p>
  <h3>Files stay on your device</h3><p>Files are read and parsed locally in a cancellable worker. Selected data remain in this tab's memory when switching tools, and are cleared by reloading or Clear. No board data or filenames are uploaded, stored in browser storage, or included in shared URLs. The PNG button exports the current view with selected filenames, colours, alignment and pixel resolution.</p>
  <h3>References</h3><ul><li><a href="https://www.ucamco.com/en/guest/downloads/gerber-format" target="_blank" rel="noreferrer">Ucamco Gerber specifications and test files</a></li><li><a href="https://github.com/tracespace/tracespace" target="_blank" rel="noreferrer">tracespace: Gerber parsing and SVG rendering</a></li></ul>
</>;}
