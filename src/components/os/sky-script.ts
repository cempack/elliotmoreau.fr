/**
 * Inline, pre-paint: sets html[data-sky] from the sun's elevation over
 * Toulouse and the saved mode before first paint. A compact form of
 * sunAt/phaseOf in lib/sun (NOAA, without the nutation terms: seconds off),
 * keep in sync. Plain module (no "use client") so the server layout gets
 * the string.
 */
export const SKY_SCRIPT = `try{var m=localStorage.getItem("em-sky")||"auto";var p=m;if(m==="auto"){var r=Math.PI/180,n=Date.now(),T=(n/864e5-10957.5)/36525,L=(280.46646+36000.76983*T)%360*r,M=(357.52911+35999.05029*T)*r,e=.016708634,l=L+(1.914602*Math.sin(M)+.019993*Math.sin(2*M)-.00569)*r,q=23.439*r,c=Math.asin(Math.sin(q)*Math.sin(l)),y=Math.pow(Math.tan(q/2),2),E=4/r*(y*Math.sin(2*L)-2*e*Math.sin(M)+4*e*y*Math.sin(M)*Math.cos(2*L)-.5*y*y*Math.sin(4*L)-1.25*e*e*Math.sin(2*M)),h=((n/6e4%1440+E+5.7768)/4+360)%360-180,a=43.6047*r,v=Math.asin(Math.sin(a)*Math.sin(c)+Math.cos(a)*Math.cos(c)*Math.cos(h*r))/r;p=v>6?"day":v<-6?"night":h<0?"dawn":"dusk"}document.documentElement.dataset.sky=p;document.documentElement.dataset.skyMode=m}catch(e){}`;
