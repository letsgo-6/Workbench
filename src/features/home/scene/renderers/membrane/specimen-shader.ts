// Original three-dimensional black-crystal mesh, illuminated tissue and drifting filaments.
export const specimenVertex = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec3 aBary;
attribute float aKind;
attribute float aSeed;
uniform float uTime;
uniform float uIndex;
uniform float uMotion;
varying vec3 vBary;
varying vec3 vNormal;
varying vec3 vLocal;
varying float vKind;
varying float vSeed;
mat2 rot(float a) { float c=cos(a),s=sin(a);return mat2(c,-s,s,c); }
void main() {
  vec3 p=aPosition,n=aNormal;
  float phase=uTime*2.5+uIndex*1.27;
  float pulse=(sin(phase)*.72+sin(phase*2.0-.4)*.28)*uMotion;
  if(uIndex>.5) {
    if(aKind<.5) { p.xz*=1.0+pulse*.15; p.y=.18+(p.y-.18)*(1.0-pulse*.16); }
    if(aKind>1.5 && aKind<2.5) {
      float down=aBary.x;
      p.x+=sin(down*9.0-phase*1.25+aSeed*12.0)*(.015+down*down*.19)*uMotion;
      p.z+=cos(down*7.0-phase+aSeed*7.0)*down*.1*uMotion;
      p.y+=pulse*.04*(1.0-down);
    }
  } else {
    p*=1.0+sin(uTime*1.8+p.y*4.0)*.035*uMotion;
  }
  if(aKind>.5 && aKind<1.5) {
    p.xy+=vec2(sin(uTime*1.3+aSeed*9.0),cos(uTime*1.1+aSeed*8.0))*.06*uMotion;
  }
  if(aKind>2.5 && aKind<3.5) p+=vec3(sin(uTime*.8+aSeed*19.0),cos(uTime*.7+aSeed*17.0),sin(uTime+aSeed*23.0))*.04*uMotion;
  float spin=uIndex<.5?uTime*.46:-.3+sin(uTime*.8+uIndex)*.24*uMotion;
  p.xz=rot(spin)*p.xz;n.xz=rot(spin)*n.xz;
  float tilt=uIndex<.5?.22+sin(uTime*.7)*.12:.15;
  p.yz=rot(tilt)*p.yz;n.yz=rot(tilt)*n.yz;
  if(uIndex>.5) p.xy=rot(-.12+sin(uTime*.6+uIndex)*.08*uMotion)*p.xy;
  float perspective=3.8/(3.8-p.z);
  gl_Position=vec4(p.xy*perspective/1.35,0,1);
  gl_PointSize=(1.3+pow(aSeed,5.0)*4.0)*perspective;
  vBary=aBary;vNormal=n;vLocal=p;vKind=aKind;vSeed=aSeed;
}
`;
export const specimenFragment = `
precision highp float;
uniform float uTime;
uniform float uDark;
uniform float uEnergy;
uniform float uLayer;
uniform vec3 uPrimary;
uniform vec3 uCore;
uniform vec3 uWhite;
varying vec3 vBary;
varying vec3 vNormal;
varying vec3 vLocal;
varying float vKind;
varying float vSeed;
void main() {
  vec3 col;float alpha;
  if(vKind<.5) {
    vec3 n=normalize(vNormal);
    float diffuse=abs(dot(n,normalize(vec3(-.6,.85,1.0))));
    float reflection=pow(abs(dot(n,normalize(vec3(-.45,.55,1.0)))),32.0);
    float edge=1.0-smoothstep(.008,.045,min(vBary.x,min(vBary.y,vBary.z)));
    float hot=pow(max(0.0,sin(dot(vLocal,vec3(4.0,3.0,2.0))-uTime*2.2)),18.0);
    float facet=step(.68,vSeed);
    col=mix(vec3(.008,.018,.021),uPrimary*.14,edge*.7);
    col+=uWhite*reflection*edge*.55+uCore*hot*edge*.85;
    alpha=(facet*(.38+diffuse*.18)+edge*.56)*uLayer;
    if(uDark<.5) alpha*=1.08;
  } else if(vKind<1.5) {
    float edge=1.0-smoothstep(.02,.12,min(vBary.x,min(vBary.y,vBary.z)));
    float charge=.4+.6*pow(.5+.5*sin(uTime*2.0+vSeed*9.0),3.0);
    col=uCore*(.9+edge*.55+charge*.25)+uWhite*pow(edge,5.0)*.22;
    alpha=(.75+edge*.2)*(.6+charge*.4);
  } else if(vKind<2.5) {
    float light=pow(.5+.5*sin(vBary.x*18.0-uTime*3.8+vSeed*17.0),14.0);
    col=mix(uPrimary*.85,uCore*1.3,light);
    alpha=(.32+light*.58)*(1.0-vBary.x*.7);
  } else if(vKind<3.5) {
    float d=length(gl_PointCoord-.5)*2.0;
    if(d>1.0) discard;
    float light=pow(.5+.5*sin(uTime*2.3+vSeed*53.0),4.0);
    col=mix(uPrimary,uCore*1.35,step(.28,vSeed))+uWhite*.24;
    alpha=exp(-d*d*5.0)*(.24+light*.72);
  } else {
    vec3 n=normalize(vNormal);
    float light=abs(dot(n,normalize(vec3(-.6,.8,1.0))));
    float reflection=pow(light,18.0);
    col=mix(vec3(.005,.025,.03),uPrimary*.2,light*.35)+uCore*reflection*.3;
    alpha=.8;
  }
  alpha=clamp(alpha*(1.0+uEnergy*.35),0.0,.96);
  col*=1.0+uEnergy*.25;
  gl_FragColor=vec4(col*alpha,alpha);
}
`;
