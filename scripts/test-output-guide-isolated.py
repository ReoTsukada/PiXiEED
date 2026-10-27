"""Offline DOM tests; no navigation or advertising network traffic.
Requires Python Playwright and Chromium. Tests the exported functions, with the
entry bootstrap omitted and dependency-injected location/ads/clipboard fakes.
Shared site CSS/header/analytics and the complete build are NOT exercised.
"""
from pathlib import Path
import json, re
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
CHECKS=[]
def check(ok,label):
    assert ok,label
    CHECKS.append(label)
SOURCE=(ROOT/'js/ads/output-guide-ad.mjs').read_text()
SOURCE=SOURCE.split("if (typeof document !== 'undefined'")[0]
SOURCE=re.sub(r'^export ', '', SOURCE, flags=re.M)
SOURCE += '\nwindow.__api = {mountOutputGuideAd, bindOutputGuideActions};'
HTML=(ROOT/'output/index.html').read_text()
HTML=re.sub(r'<script\b[\s\S]*?</script>', '', HTML)
HTML=re.sub(r'<link\b[^>]*>', '', HTML)
HTML=re.sub(r'<img\b[^>]*>', '', HTML)
CSS=(ROOT/'css/output-guide-growth.css').read_text()
CSS+='\n*{box-sizing:border-box}body{margin:0}main{width:calc(100% - 40px);max-width:1100px;margin:auto}section{margin:64px 0}.capability-table-wrap{overflow:auto}.mobile-nav{display:none}'
CONFIG={'enabled':True,'unit':{'verifiedActive':True,'format':'display','placement':'inline','size':'responsive','client':'ca-pub-9801602250480253','slot':'4842737836'}}

def make(browser,width=390,path='/output/',search='',mode='filled',enabled=True,framed=False):
    page=browser.new_page(viewport={'width':width,'height':844})
    page.route('**/*',lambda r:r.abort())
    page.set_content(HTML.replace('</head>', '<style>'+CSS+'</style></head>'))
    page.evaluate(SOURCE)
    cfg={**CONFIG,'enabled':enabled}
    page.evaluate('''({path,search,mode,config,framed})=>{
      window.__pushes=0; window.__loaders=0; window.__events=[];window.__clipboard='';
      const append=document.head.append.bind(document.head);
      document.head.append=(node)=>{
        if(node.tagName==='SCRIPT'&&node.src.includes('pagead2.googlesyndication.com')){
          window.__loaders++; node.type='text/plain';
          if(mode==='blocked')queueMicrotask(()=>node.dispatchEvent(new Event('error')));
        }
        append(node);
      };
      const fake={location:{origin:'https://pixieed.jp',pathname:path,search},
        top:window,self:framed?{}:window,innerHeight:innerHeight,
        IntersectionObserver,MutationObserver,getComputedStyle:getComputedStyle.bind(window),
        addEventListener:addEventListener.bind(window),removeEventListener:removeEventListener.bind(window),
        navigator:{clipboard:{writeText:async(text)=>{window.__clipboard=text;}}},
        adsbygoogle:{push:()=>{window.__pushes++;if(mode!=='blocked')queueMicrotask(()=>{
          document.querySelector('ins.adsbygoogle').dataset.adStatus=mode;
        });}}
      };
      window.__fake=fake;window.__cfg=config;
      window.__result=window.__api.mountOutputGuideAd({doc:document,win:fake,config});
      window.__unbind=window.__api.bindOutputGuideActions({doc:document,win:fake,track:(...args)=>__events.push(args)});
    }''',{'path':path,'search':search,'mode':mode,'config':cfg,'framed':framed})
    return page

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for width in [320,390,1440]:
        page=make(browser,width)
        check(page.evaluate('__loaders===0'),f'{width}: lazy; no loader initially')
        ad=page.locator('[data-output-guide-ad]')
        ad.scroll_into_view_if_needed()
        page.wait_for_function("document.querySelector('[data-output-guide-ad]').dataset.adState==='filled'")
        check(page.evaluate('__loaders===1&&__pushes===1'),f'{width}: exactly one stub loader/request')
        rect=page.locator('ins.adsbygoogle').bounding_box()
        check(rect['width']>=250 and rect['height']==250,f'{width}: explicit dimensions')
        check(page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'{width}: fixture fits width')
        page.evaluate("scrollTo(0,0);dispatchEvent(new Event('resize'));dispatchEvent(new Event('scroll'))")
        ad.scroll_into_view_if_needed();page.wait_for_timeout(30)
        check(page.evaluate('__pushes===1'),f'{width}: no refresh on scroll/resize')
        page.evaluate('__api.mountOutputGuideAd({doc:document,win:__fake,config:__cfg})')
        check(page.locator('ins.adsbygoogle').count()==1,f'{width}: duplicate mount idempotent')
        page.locator('[data-output-copy]').click()
        page.wait_for_timeout(20)
        check(page.evaluate("__clipboard==='https://pixieed.jp/output/'"),f'{width}: canonical-only clipboard')
        check(page.evaluate("__events.some(([name])=>name==='link_copy')"),f'{width}: copy metric uses existing event')
        page.close()
    for path,search,framed in [('/output/work/','',False),('/output/start/','',False),('/output/','?id=private',False),('/output/','?utm_source=test',False),('/output/','',True)]:
        page=make(browser,path=path,search=search,framed=framed)
        check(page.evaluate('__loaders===0&&__pushes===0&&!__result.mounted'),f'{path}{search} framed={framed}: fail closed')
        page.close()
    page=make(browser,enabled=False)
    check(page.evaluate('__loaders===0&&__pushes===0&&!__result.mounted'),'disabled switch: no advertising')
    page.close()
    for mode in ['unfilled','blocked']:
        page=make(browser,mode=mode)
        page.locator('[data-output-guide-ad]').scroll_into_view_if_needed()
        page.wait_for_function("['unfilled','empty'].includes(document.querySelector('[data-output-guide-ad]').dataset.adState)")
        check(page.locator('[data-output-start]').count()==2,f'{mode}: both tool links retained')
        page.evaluate('scrollTo(0,0)');page.wait_for_timeout(60)
        check(page.locator('[data-output-guide-ad]').is_hidden(),f'{mode}: collapses only off-screen')
        page.evaluate('scrollTo(0,document.body.scrollHeight)');page.wait_for_timeout(30)
        check(page.evaluate('__loaders===1&&__pushes===1'),f'{mode}: no retry')
        page.close()
    browser.close()
result={'passed':len(CHECKS),'failed':0,'scope':'offline DOM; fake location, provider, clipboard; entry bootstrap omitted; shared base styles simplified','checks':CHECKS}
(ROOT/'docs/output-guide-browser-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False,indent=2))
