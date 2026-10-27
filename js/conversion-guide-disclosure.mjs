/** Reveal optional guidance only when a user follows a recognized deep link. */
function reveal(){
  const id=location.hash.slice(1);
  if(!['output-purpose-image','output-purpose-audio','output-purpose-video','guide-format-details'].includes(id))return;
  const node=document.getElementById(id);
  if(!node)return;
  for(let parent=node;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
}
window.addEventListener('hashchange',reveal);
reveal();
