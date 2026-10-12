// A small terminal editor: no native editable element, so ordinary text composition
// is not the input path. Physical keys, clipboard events and our A-Z keypad share it.
export function englishKey(event){
  if(event.ctrlKey||event.metaKey||event.altKey)return null;
  if(/^[a-z]$/i.test(event.key))return event.key.toUpperCase();
  if(/^Key[A-Z]$/.test(event.code||''))return event.code.slice(3);
  if(event.key===' '||event.code==='Space')return ' ';
  return null;
}

export class TerminalBuffer{
  constructor(){this.value='';this.anchor=0;this.caret=0;}
  get start(){return Math.min(this.anchor,this.caret);}
  get end(){return Math.max(this.anchor,this.caret);}
  get selected(){return this.value.slice(this.start,this.end);}
  move(position,extend=false){this.caret=Math.max(0,Math.min(this.value.length,position));if(!extend)this.anchor=this.caret;}
  set(raw){this.value=String(raw).slice(0,48);this.move(this.value.length);}
  insert(raw){
    const text=String(raw).normalize('NFKC').replace(/\s/g,' ').toUpperCase();
    if(!/^[A-Z ]*$/.test(text))return false;
    const capacity=48-(this.value.length-(this.end-this.start));
    const inserted=text.slice(0,capacity),start=this.start;
    this.value=this.value.slice(0,start)+inserted+this.value.slice(this.end);
    this.move(start+inserted.length);
    const prefix=this.value.match(/^\s*STOP\s+T/);
    if(prefix){this.value=this.value.slice(prefix[0].length);this.move(Math.max(0,this.caret-prefix[0].length));}
    return true;
  }
  erase(direction=-1,word=false){
    if(this.start!==this.end){this.insert('');return;}
    if(direction<0){
      let target=this.caret-1;
      if(word)target=this.value.slice(0,this.caret).replace(/\S+\s*$/,'').length;
      this.move(Math.max(0,target),true);
    }else this.move(this.caret+1,true);
    this.insert('');
  }
}

// columns: visible character cells; placeholder: the mask shown while empty ('' shows none).
export function createTerminalInput(element,{keyboard,onSubmit,onChange,onInvalid,columns=11,placeholder='__ _______'}={}){
  const buffer=new TerminalBuffer();
  let disabled=false,offset=0,dragging=false,typedTimer,mask=String(placeholder);
  element.style.setProperty('--entry-columns',String(columns));
  const glyphs=element.querySelector('.entry-glyphs');
  const cursor=element.querySelector('.block-caret');
  const announcement=document.querySelector('#typed-announcement');
  const keys=keyboard.querySelector('.keyboard-keys');
  for(const letters of ['QWERTYUIOP','ASDFGHJKL','ZXCVBNM']){
    const row=document.createElement('div');row.className='keyboard-row';
    for(const letter of letters){const button=document.createElement('button');button.type='button';button.dataset.key=letter;button.textContent=letter;row.append(button);}
    keys.append(row);
  }
  const actions=document.createElement('div');actions.className='keyboard-row keyboard-actions';
  for(const [key,label,title] of [['Backspace','⌫','退格'],[' ','SPACE','空格'],['Enter','↵','提交代码']]){
    const button=document.createElement('button');button.type='button';button.dataset.key=key;button.textContent=label;button.setAttribute('aria-label',title);actions.append(button);
  }
  keys.append(actions);
  function render(announce=false){
    if(buffer.caret<offset)offset=buffer.caret;
    if(buffer.caret>offset+columns-1)offset=buffer.caret-(columns-1);
    offset=Math.min(offset,Math.max(0,buffer.value.length-(columns-1)));
    const placeholder=!buffer.value,visible=placeholder?mask:buffer.value;
    if(mask)element.setAttribute('aria-placeholder',mask);else element.removeAttribute('aria-placeholder');
    glyphs.replaceChildren();glyphs.classList.toggle('placeholder',placeholder);
    glyphs.style.transform=`translateX(-${offset}ch)`;
    glyphs.setAttribute('aria-hidden',String(placeholder));
    [...visible].forEach((char,index)=>{
      const span=document.createElement('span');span.textContent=char;
      if(!placeholder&&index>=buffer.start&&index<buffer.end)span.className='selected-glyph';
      glyphs.append(span);
    });
    cursor.style.left=`${buffer.caret-offset}ch`;cursor.dataset.glyph=buffer.value[buffer.caret]||'\u00a0';
    cursor.classList.toggle('selection-caret',buffer.start!==buffer.end);
    element.dataset.value=buffer.value;element.dataset.caret=String(buffer.caret);
    element.classList.toggle('has-value',Boolean(buffer.value));
    element.setAttribute('aria-disabled',String(disabled));element.tabIndex=disabled?-1:0;
    element.closest('form').classList.toggle('has-entry',Boolean(buffer.value));
    if(announce&&announcement){clearTimeout(typedTimer);typedTimer=setTimeout(()=>{announcement.textContent=buffer.value||'输入已清空';},180);}
  }
  function changed(){render(true);onChange?.(buffer.value);}
  function insert(value){if(disabled)return;buffer.insert(value)?changed():onInvalid?.();}
  function focus(){if(!disabled)element.focus({preventScroll:true});}
  function showKeyboard(){if(disabled)return;keyboard.hidden=false;document.body.classList.add('keyboard-open');focus();}
  function hideKeyboard(){keyboard.hidden=true;document.body.classList.remove('keyboard-open');document.documentElement.style.setProperty('--keyboard-height','0px');}
  new ResizeObserver(()=>document.documentElement.style.setProperty('--keyboard-height',keyboard.hidden?'0px':`${keyboard.offsetHeight+22}px`)).observe(keyboard);
  function keyAction(key){
    if(disabled)return;
    if(key==='Enter'){hideKeyboard();onSubmit?.();}
    else if(key==='Backspace'){buffer.erase();changed();}
    else insert(key);
  }
  element.addEventListener('keydown',event=>{
    if(disabled)return;
    const shortcut=event.ctrlKey||event.metaKey;
    if(shortcut&&event.key.toLowerCase()==='a'){event.preventDefault();buffer.anchor=0;buffer.caret=buffer.value.length;render();return;}
    if(shortcut&&['c','x','v'].includes(event.key.toLowerCase()))return;
    if(event.key==='Backspace'||event.key==='Delete'){
      event.preventDefault();
      if(event.metaKey&&event.key==='Backspace'){buffer.anchor=0;buffer.insert('');}
      else buffer.erase(event.key==='Backspace'?-1:1,shortcut||event.altKey);
      changed();return;
    }
    if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
      event.preventDefault();let target=buffer.caret;
      if(event.key==='Home'||(event.key==='ArrowLeft'&&shortcut))target=0;
      else if(event.key==='End'||(event.key==='ArrowRight'&&shortcut))target=buffer.value.length;
      else if(event.key==='ArrowLeft')target=!event.shiftKey&&buffer.start!==buffer.end?buffer.start:buffer.caret-1;
      else target=!event.shiftKey&&buffer.start!==buffer.end?buffer.end:buffer.caret+1;
      buffer.move(target,event.shiftKey);render();return;
    }
    if(shortcut||event.altKey)return;
    if(event.key==='Enter'){event.preventDefault();keyAction('Enter');return;}
    const letter=englishKey(event);
    if(letter!==null){event.preventDefault();insert(letter);return;}
    // A driver that supplies no physical key information still gets an English path.
    if(event.key==='Process'||event.isComposing||event.keyCode===229){event.preventDefault();showKeyboard();}
  });
  element.addEventListener('paste',event=>{if(disabled)return;event.preventDefault();insert(event.clipboardData?.getData('text/plain')||'');});
  for(const type of ['copy','cut'])element.addEventListener(type,event=>{
    if(!buffer.selected||!event.clipboardData)return;
    event.preventDefault();event.clipboardData.setData('text/plain',buffer.selected);
    if(type==='cut'&&!disabled){buffer.insert('');changed();}
  });
  const atPointer=event=>{
    const rect=element.getBoundingClientRect();return offset+Math.round((event.clientX-rect.left)/(rect.width/columns));
  };
  element.addEventListener('pointerdown',event=>{
    if(disabled||event.button!==0)return;
    event.preventDefault();focus();buffer.move(atPointer(event),event.shiftKey);render();
    if(event.pointerType==='touch'||event.pointerType==='pen'){showKeyboard();return;}
    dragging=true;element.setPointerCapture(event.pointerId);
  });
  element.addEventListener('pointermove',event=>{if(dragging){buffer.move(atPointer(event),true);render();}});
  element.addEventListener('pointerup',event=>{dragging=false;if(element.hasPointerCapture(event.pointerId))element.releasePointerCapture(event.pointerId);});
  element.addEventListener('pointercancel',()=>{dragging=false;});
  element.addEventListener('focus',()=>element.classList.add('is-focused'));
  element.addEventListener('blur',()=>element.classList.remove('is-focused'));
  keys.addEventListener('pointerdown',event=>{if(event.target.closest('button'))event.preventDefault();});
  keys.addEventListener('click',event=>{const button=event.target.closest('[data-key]');if(button){focus();keyAction(button.dataset.key);}});
  keyboard.querySelector('[data-close-keyboard]').addEventListener('click',()=>{hideKeyboard();focus();});
  render();
  return {
    element,focus,showKeyboard,hideKeyboard,insert,
    get value(){return buffer.value;},set value(value){buffer.set(value);offset=0;render();},
    get placeholder(){return mask;},set placeholder(value){mask=String(value??'');render();},
    get disabled(){return disabled;},set disabled(value){disabled=Boolean(value);if(disabled){clearTimeout(typedTimer);if(announcement)announcement.textContent='';hideKeyboard();}render();},
    get keyboardOpen(){return !keyboard.hidden;},
    get selection(){return {start:buffer.start,end:buffer.end,caret:buffer.caret};}
  };
}
