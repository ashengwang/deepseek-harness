/** A fixed bootstrap runs inside the opaque iframe; no Host callbacks enter its document. */
import { decodeText, encodeText } from './bytes.ts'

/** One statically declared local script or stylesheet, already read under the source file's authority. */
export interface HtmlAsset {
  readonly kind: 'script' | 'stylesheet'
  /** Original HTML attribute, not a Host absolute path. */
  readonly reference: string
  readonly data: Uint8Array<ArrayBuffer>
}

/** Complete bytes for one document; dependencies are finite and never requested by iframe messages. */
export interface HtmlBundle {
  readonly data: Uint8Array<ArrayBuffer>
  readonly assets: readonly HtmlAsset[]
}

/** Print coordination inserted ahead of the untrusted document. */
export interface HtmlDocumentOptions {
  /** Capability shared only with the owning preview component. */
  readonly printToken: string
  /** Start native printing after this document finishes loading. */
  readonly autoPrint: boolean
}

/**
 * Build the outer iframe document. Its resource URLs are created inside the sandbox,
 * because that opaque origin cannot load resource URLs created by the parent.
 * @param bundle - complete HTML bytes and optional static dependencies.
 * @param options - Optional print coordination token and automatic printing mode.
 * @returns bootstrap HTML; invalid UTF-8 throws before navigation.
 */
export function createHtmlDocument(bundle: HtmlBundle, options?: HtmlDocumentOptions): string {
  const payload = encodeText(JSON.stringify({
    html: decodeText(bundle.data),
    assets: bundle.assets.map(asset => ({ kind: asset.kind, reference: asset.reference, text: decodeText(asset.data) })),
    printToken: options?.printToken,
    autoPrint: options?.autoPrint === true,
  }))
  return `<!doctype html><meta charset="utf-8"><script>(()=>{
const bytes=data=>Uint8Array.from(atob(data),character=>character.charCodeAt(0));
const text=data=>new TextDecoder('utf-8',{fatal:true}).decode(bytes(data));
const bundle=JSON.parse(text("${payload}"));
const notify=type=>parent.postMessage({type,token:bundle.printToken},'*');
if(bundle.printToken&&!bundle.autoPrint)addEventListener('keydown',event=>{
  if(event.isTrusted&&event.key.toLowerCase()==='p'&&(event.metaKey||event.ctrlKey)&&!event.altKey){
    event.preventDefault();event.stopImmediatePropagation();notify('dsh-html-preview-print-request');
  }
},true);
if(bundle.printToken&&bundle.autoPrint){
  const printDocument=window.print.bind(window);
  const finishPrint=event=>{
    if(!event.isTrusted)return;
    removeEventListener('afterprint',finishPrint);notify('dsh-html-preview-print-finished');
  };
  addEventListener('load',()=>setTimeout(()=>printDocument(),0),{once:true});
  addEventListener('afterprint',finishPrint);
}
let html=bundle.html;
if(bundle.assets.length){
  const parsed=new DOMParser().parseFromString(html,'text/html');
  for(const asset of bundle.assets){
    const script=asset.kind==='script';
    const url=URL.createObjectURL(new Blob([asset.text],{type:script?'application/javascript':'text/css'}));
    const attribute=script?'src':'href';
    for(const element of parsed.querySelectorAll(script?'script[src]':'link[rel~="stylesheet" i][href]')){
      if(element.getAttribute(attribute)===asset.reference)element.setAttribute(attribute,url);
    }
  }
  html='<!doctype html>'+parsed.documentElement.outerHTML;
}
document.open();document.write(html);document.close();
})()</script>`
}
