const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
const fs = require('fs');
const vm = require('node:vm');
const path = require('node:path');
const dir = __dirname;

function load(file, mockRequire) {
  const out = {exports:{}};
  const src = fs.readFileSync(file, 'utf8');
  const code = ts.transpileModule(src, {fileName:file, compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const fn = vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file});
  fn(mockRequire,out,out.exports);
  return out.exports;
}
const queueExports=load(path.join(dir,'titleSaveQueue.ts'),()=>{throw Error('Unexpected import')});
const chapterTitles = load(path.resolve(dir,'../../book/domain/chapters/chapterTitles.ts'),()=>{throw Error('Unexpected import')});

function mountTitle(initial, save, normalize=chapterTitles.formatBookTitle, errorLog=[]) {
  const slots=[], effects=[];let cursor=0, active=true;
  function equal(a,b){return a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));}
  const react={
    useState(seed) {let i=cursor++;if (!(i in slots)) slots[i]={v:typeof seed==='function'?seed():seed};return [slots[i].v,(next)=>{slots[i].v=typeof next==='function'?next(slots[i].v):next;}];},
    useRef(seed) {let i=cursor++;if(!(i in slots))slots[i]={current:seed};return slots[i];},
    useCallback(fn,deps){let i=cursor++;if(!slots[i]||!equal(deps,slots[i].deps))slots[i]={fn,deps};return slots[i].fn;},
    useEffect(effect,deps){let i=cursor++;if(!slots[i]||!equal(deps,slots[i].deps)){const prev=slots[i];effects.push(()=>{prev?.cleanup?.(); slots[i]={deps,cleanup:effect()};});}}
  };
  const {useAutosavedTitle}=load(path.join(dir,'useAutosavedTitle.ts'),(name)=> {
    if(name==='react')return react;
    if(name==='./titleSaveQueue.js')return queueExports;
    throw Error(name);
  });
  let sourceTitle=initial, api;
  const render=()=>{assert.ok(active);cursor=0;api=useAutosavedTitle({sourceTitle,normalize,save,onError:e=>errorLog.push(e)});while(effects.length)effects.shift()();return api;};
  const unmount=()=>{active=false;for(const entry of slots)entry?.cleanup?.();};
  render();
  return {get current(){return api;},render,unmount,external(next){sourceTitle=next;render();},get errorLog(){return errorLog;}};
}

const wait=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));

test('Course book title: typing alone persists after debounce, including a readback/remount', async()=>{
  let stored='Initial Book';const page=mountTitle(stored,async title=>{stored=title;});
  page.current.onChange('a guide to coding');page.render();
  assert.equal(stored,'Initial Book');
  await wait(720);page.render();
  assert.equal(stored,'A Guide to Coding');
  assert.equal(page.current.status,'saved');
  page.unmount();
  const reopened=mountTitle(stored,async()=>{});
  assert.equal(reopened.current.title,'A Guide to Coding');reopened.unmount();
});

test('Course book title: blur and Enter flush immediately and normalize casing',async()=>{
  let stored='Initial Book';const page=mountTitle(stored,async title=>{stored=title;});
  page.current.onChange('understanding machine learning');page.render();
  await page.current.flush(true);page.render();
  assert.equal(stored,'Understanding Machine Learning');
  assert.equal(page.current.title,stored);
  page.current.onChange('the art of writing');page.render();
  await page.current.flush(true);page.render();
  assert.equal(stored,'The Art of Writing');page.unmount();
});

test('Chapter title: strips numeric prefixes and persists on blur',async()=>{
  let stored='1. First Chapter';const page=mountTitle(stored,async title=>{stored=title;},chapterTitles.formatChapterTitle);
  page.current.onChange('3. working with fractions');page.render();
  await page.current.flush(true);page.render();
  assert.equal(stored,'Working with Fractions');page.unmount();
});

test('Switching away from Course commits a draft even before debounce',async()=>{
  let stored='Old Book';const page=mountTitle(stored,async title=>{stored=title;});
  page.current.onChange('updated book');page.render();page.unmount();
  await wait(25);assert.equal(stored,'Updated Book');
});

test('New edits are queued behind slow edits; latest value survives',async()=>{
  let stored='Original';let release;
  const page=mountTitle(stored,async title=>{
    if(title==='First Edit')await new Promise(resolve=>{release=resolve;});
    stored=title;
  });
  page.current.onChange('first edit');page.render();
  const first=page.current.flush();await wait(5);
  page.current.onChange('second edit');page.render();
  const second=page.current.flush();release();
  await Promise.all([first,second]);page.render();
  assert.equal(stored,'Second Edit');assert.equal(page.current.status,'saved');page.unmount();
});

test('Failure remains visible and Retry persists the same draft',async()=>{
  let stored='Original', fail=true;const errors=[];
  const page=mountTitle(stored,async title=>{if(fail){throw Error('IndexedDB blocked');}stored=title;},chapterTitles.formatBookTitle,errors);
  page.current.onChange('a new title');page.render();
  await page.current.flush();page.render();
  assert.equal(page.current.status,'error');assert.equal(errors.length,1);
  fail=false;await page.current.flush(true);page.render();
  assert.equal(stored,'A New Title');assert.equal(page.current.status,'saved');page.unmount();
});


test('Course and chapter input elements wire change, blur, and Enter to autosave',()=>{
  const source=fs.readFileSync(path.join(dir,'SkillsCourse.tsx'),'utf8');
  const root=ts.createSourceFile('SkillsCourse.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
  const entries=[];
  function visit(node){
    if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(root)==='input'){
      const props=new Map(node.attributes.properties.map(a=>[a.name?.getText(root),a.initializer?.getText(root)||'']));
      entries.push(props);
    }
    ts.forEachChild(node,visit);
  }
  visit(root);
  const book=entries.find(x=>x.get('aria-label')==="'Course name'");
  const chapter=entries.find(x=>x.get('aria-label')==="'Chapter name'");
  for(const [label,entry] of [['book',book],['chapter',chapter]]){
    assert.ok(entry,label+' input is present');
    for(const prop of ['value','onChange','onBlur','onKeyDown'])assert.ok(entry.has(prop),label+' input must implement '+prop);
    assert.match(entry.get('onChange'),/onChange\(|changeCourseName\(/);
    assert.match(entry.get('onBlur'),/flush\(|flushCourseName\(/);
    assert.match(entry.get('onKeyDown'),/event\.key === 'Enter'/);
  }
});
