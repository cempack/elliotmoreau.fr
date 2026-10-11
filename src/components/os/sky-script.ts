/**
 * Inline, pre-paint: sets html[data-sky] from the Toulouse hour and the saved
 * mode before first paint. Mirrors phaseForHour in ./sky.tsx — keep in sync.
 * Plain module (no "use client") so the server layout gets the string.
 */
export const SKY_SCRIPT = `try{var m=localStorage.getItem("em-sky")||"auto";var p=m;if(m==="auto"){var f=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Paris",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(new Date());var h=+f.find(function(x){return x.type==="hour"}).value%24+(+f.find(function(x){return x.type==="minute"}).value)/60;p=h>=5.5&&h<8.5?"dawn":h>=8.5&&h<17.5?"day":h>=17.5&&h<21?"dusk":"night"}document.documentElement.dataset.sky=p;document.documentElement.dataset.skyMode=m}catch(e){}`;
