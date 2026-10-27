/** Keep all existing project handoffs on the original workspace. */
const query=new URLSearchParams(location.search);
const simple=query.get('mode')==='convert'&&!query.has('id');
if(simple){
  const css=document.createElement('link');css.rel='stylesheet';css.href='/css/conversion-simple.css?rev=20261028-conversion-1';document.head.append(css);
  try{const {mountConversionPage}=await import('./conversion-page.mjs?rev=20261028-conversion-1');mountConversionPage();}
  catch{const main=document.getElementById('main');if(main){main.replaceChildren();const p=document.createElement('p');p.textContent='変換画面を読み込めませんでした。再読み込みするか、詳細ワークスペースをご利用ください。';const a=document.createElement('a');a.href='/output/work/';a.textContent='詳細ワークスペースを開く';main.append(p,a);}}
}else{
  await import('./output-page.mjs?rev=20261024-common-tool-start-1');
}
