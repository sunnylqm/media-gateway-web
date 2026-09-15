import type { Recipe } from './recipe';

export const fullscreen = `#version 300 es
precision highp float;
out vec2 uv;
void main(){
  vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
  uv=p; gl_Position=vec4(p*2.-1.,0.,1.);
}`;

const volume = `#version 300 es
precision highp float;
precision highp sampler3D;
/* RECIPE */
in vec2 uv;
out vec4 frag;
uniform sampler3D u_noise;
uniform mat3 u_camera;
uniform vec3 u_origin;
uniform float u_aspect,u_fov,u_range;

float n3(vec3 p){return texture(u_noise,(p+.5)/64.).r;}
float fbm(vec3 p){
  float sum=0.,a=.54;
  for(int i=0;i<4;i++){sum+=a*n3(p); p=p*2.07+vec3(13.1,7.7,5.3); a*=.48;}
  return sum;
}
vec3 subject(vec3 p){
  // Portrait frames see the same world from a shifted framing, not a stretched sky.
  vec3 c=CENTER;
  c.x*=mix(.32,1.,smoothstep(.65,1.35,u_aspect));
  vec3 q=p-c;
  q.xy=mat2(ROLL.x,-ROLL.y,ROLL.y,ROLL.x)*q.xy;
  return q*SCALE;
}
vec2 primary(vec3 p,float f){
#if MODE == 0
  float ridge=p.y-p.x*.42+4.0-5.*pow(abs(sin(p.x*.23*CURL+p.z*.12)),5.)+(f-.5)*13.*ROUGH;
  float mass=smoothstep(.29,.66,f);
  float wall=1.-smoothstep(-1.1,1.0,ridge);
  return vec2(wall*mass*exp(-pow(p.z/(5.*THICK),2.))*.45,exp(-abs(ridge)*.75));
#elif MODE == 1
  vec3 q=vec3(p.x*.89+p.z*.30,p.y,p.z*.84-p.x*.33);
  float shell=length(q*vec3(.91,1.,1.23))-9.5+(f-.5)*5.6*ROUGH;
  float shellA=exp(-pow(shell/(1.6*THICK),2.));
  float shellB=exp(-pow((shell-2.9)/.8,2.))*.20;
  float cavity=smoothstep(4.7,8.7,length(q.xy)+(f-.5)*2.);
  return vec2((shellA+shellB)*smoothstep(.23,.65,f)*.38*cavity,exp(-abs(shell+.7)*.9));
#elif MODE == 2
  float mass=0.,edge=0.;
  for(int j=0;j<3;j++){
    float k=float(j)-1.;
    float top=k*3.6;
    vec2 axis=vec2(k*8.5+sin(p.y*.16*CURL+k*1.7)*1.7,k*6.);
    float radius=(1.9+clamp((top-p.y)*.10,0.,2.8))*THICK;
    float side=length((p.xz-axis)*vec2(1.,.74))-radius;
    float boundary=max(side,p.y-top)+(f-.5)*6.8*ROUGH;
    mass+=(1.-smoothstep(-1.1,.8,boundary))*smoothstep(.27,.65,f)*.52;
    edge=max(edge,exp(-abs(boundary)*.85));
  }
  return vec2(mass,edge);
#else
  float line=p.y+p.x*.35-2.8*sin(p.x*.17*CURL+p.z*.13)+(f-.5)*10.*ROUGH;
  float bands=exp(-pow(line/(2.2*THICK),2.))+exp(-pow((line+6.3)/1.2,2.))*.50;
  return vec2(bands*smoothstep(.22,.67,f)*exp(-pow(p.z/6.,2.))*.33,exp(-abs(line-.4)*.65));
#endif
}
// One hero plus one subordinate filament and one local dust veil. Their roles
// are bounded, and all fields are world-fixed; there is no per-frame randomness.
vec4 material(vec3 world){
  vec3 p=subject(world);
  vec3 q=p*vec3(.23,.29,.20)+DETAIL;
  vec3 warp=texture(u_noise,(q*.72+12.4)/64.).rgb-.5;
  float f=fbm(q*1.8+warp*2.7);
  vec2 hero=primary(p,f);
  float phase=SECOND.x;
  float lane=p.y-SECOND.y-3.8*sin(p.x*.13+phase)+(f-.5)*4.;
  float fine=exp(-pow(lane/.66,2.))+exp(-pow((lane+1.7)/.32,2.))*.40;
  float extent=exp(-pow((p.x-1.5)/8.5,2.));
  float thread=fine*smoothstep(.32,.66,f)*exp(-pow((world.z-SECOND.z)/2.2,2.))*SECOND.w*extent*.55;
  float veil=exp(-pow((world.z-7.5)/2.,2.))*smoothstep(.55,.77,f)
    *(1.-smoothstep(-7.,-3.,p.y-p.x*.18))*.26;
  return vec4(hero.x*DENSITY,hero.y,thread,veil);
}
void main(){
  vec2 p=uv*2.-1.;
  vec3 ray=u_camera*normalize(vec3(p.x*u_aspect*u_fov,p.y*u_fov,1.));
  float trans=1.; vec3 radiance=vec3(0.);
  const int STEPS=40;
  float dz=46./float(STEPS), ds=dz/max(ray.z,.15);
  for(int i=0;i<STEPS;i++){
    float z=2.+(float(i)+.5)*dz;
    vec3 world=u_origin+ray*((z-u_origin.z)/max(ray.z,.15));
    vec4 m=material(world);
    float total=m.x+m.z+m.w;
    if(total<.0005) continue;
    vec3 local=subject(world);
    float weave=smoothstep(-.4,.6,sin(local.x*.23+local.y*.18+DETAIL.x)+sin(local.z*.32)*.35);
    vec3 skin=mix(BODY,RIM,weave*.88);
    float shadow=exp(-material(world+vec3(-1.4,2.6,-1.1)).x*5.);
    vec3 lp=LIGHT;
    lp.x*=mix(.32,1.,smoothstep(.65,1.35,u_aspect));
    float lamp=exp(-dot(world-lp,world-lp)*.045);
    float scattered=m.y*(.65+1.6*shadow);
    vec3 heroLight=BODY*.23+skin*scattered*2.2+ACCENT*lamp*(.22+m.y*.8);
    vec3 emissive=FILAMENT*(1.1+.6*weave);
    vec3 source=(m.x*heroLight+m.z*emissive+m.w*BODY*.045)/max(total,.00001);
    float alpha=1.-exp(-total*ds);
    radiance+=trans*alpha*source;
    trans*=1.-alpha;
    if(trans<.008)break;
  }
  float glow=exp(-length(p-vec2(.34,.42))*1.6);
  radiance+=trans*(vec3(.0018,.003,.008)+BODY*.032*glow);
  // Linear HDR is preserved here; tone mapping occurs once after stars/bloom.
  frag=vec4(radiance*u_range,trans);
}`;

export function volumeSource(recipe: Recipe) {
  const scalar = (n: string, v: number) => `const float ${n}=${v.toFixed(6)};`;
  const vec = (n: string, v: readonly number[]) => `const vec${v.length} ${n}=vec${v.length}(${v.map((x) => x.toFixed(6)).join(',')});`;
  // Recipe values are internally constructed finite numbers; never URL text.
  const [body, rim, filament, accent] = recipe.palette;
  return volume.replace('/* RECIPE */', [
    `#define MODE ${recipe.mode}`,
    vec('CENTER', recipe.center), vec('SCALE', recipe.scale),
    vec('DETAIL', recipe.detail), vec('ROLL', [Math.cos(recipe.roll), Math.sin(recipe.roll)]),
    scalar('THICK', recipe.thickness), scalar('DENSITY', recipe.density),
    scalar('CURL', recipe.curl), scalar('ROUGH', recipe.roughness),
    vec('SECOND', recipe.secondary), vec('LIGHT', recipe.light),
    vec('BODY', body), vec('RIM', rim), vec('FILAMENT', filament), vec('ACCENT', accent),
  ].join('\n'));
}

export const copy = `#version 300 es
precision highp float;
in vec2 uv; uniform sampler2D u_tex; out vec4 frag;
void main(){frag=vec4(texture(u_tex,uv).rgb,1.);}`;

export const starVertex = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_color;
layout(location=2) in vec2 a_light;
uniform mat3 u_camera;
uniform vec3 u_origin;
uniform float u_aspect,u_fov,u_time,u_ratio,u_pointMax;
out vec3 color; out float bright,depth;
void main(){
  vec3 pos=transpose(u_camera)*(a_pos-u_origin);
  float scintillation=1.+.025*sin(u_time*.6+dot(a_pos,vec3(.71,.27,.44)));
  color=a_color*a_light.x*scintillation;
  bright=smoothstep(1.6,3.2,a_light.x);depth=a_pos.z;
  gl_Position=pos.z>.1?vec4(pos.x/(u_aspect*u_fov),pos.y/u_fov,0.,pos.z):vec4(2.,2.,2.,1.);
  float perspective=clamp((a_pos.z+12.)/max(pos.z,.1),.6,1.8);
  gl_PointSize=clamp(a_light.y*u_ratio*perspective,1.,u_pointMax);
}`;
export const starFragment = `#version 300 es
precision highp float;
in vec3 color; in float bright,depth;
uniform sampler2D u_volume;
uniform vec2 u_resolution;
uniform float u_range;
out vec4 frag;
void main(){
  vec2 p=gl_PointCoord*2.-1.;float r=dot(p,p);
  if(r>1.)discard;
  float core=exp(-r*65.);
  float halo=exp(-r*9.)*.035;
  float rays=(exp(-abs(p.x)*105.)+exp(-abs(p.x*.5+p.y*.866)*105.)+exp(-abs(p.x*.5-p.y*.866)*105.))*exp(-length(p)*5.5)*bright*.10;
  float dust=texture(u_volume,gl_FragCoord.xy/u_resolution).a;
  float extinction=mix(1.,max(.015,dust),smoothstep(6.,48.,depth));
  frag=vec4(color*(core+halo+rays)*extinction*u_range,0.);
}`;

// First bloom level isolates high radiance with a soft knee. A second, smaller
// level broadens only that radiance, rather than blurring the entire sky.
export const bloomExtract = `#version 300 es
precision highp float;
in vec2 uv; uniform sampler2D u_tex; uniform vec2 u_texel; out vec4 frag;
void main(){
  vec3 c=(texture(u_tex,uv+u_texel*vec2(-1.,-1.)).rgb+texture(u_tex,uv+u_texel*vec2(1.,-1.)).rgb+texture(u_tex,uv+u_texel*vec2(-1.,1.)).rgb+texture(u_tex,uv+u_texel*vec2(1.,1.)).rgb)*.25;
  float peak=max(c.r,max(c.g,c.b));
  float knee=clamp((peak-.60)/.55,0.,1.);
  float weight=max(peak-1.05,knee*knee*.22)/max(peak,.0001);
  frag=vec4(c*weight,1.);
}`;
export const blur = `#version 300 es
precision highp float;
in vec2 uv; uniform sampler2D u_tex; uniform vec2 u_step; out vec4 frag;
void main(){
  vec3 c=texture(u_tex,uv).rgb*.227027;
  c+=(texture(u_tex,uv+u_step*1.384615).rgb+texture(u_tex,uv-u_step*1.384615).rgb)*.316216;
  c+=(texture(u_tex,uv+u_step*3.230769).rgb+texture(u_tex,uv-u_step*3.230769).rgb)*.070270;
  frag=vec4(c,1.);
}`;
export const output = `#version 300 es
precision highp float;
in vec2 uv; uniform sampler2D u_scene,u_near,u_far;
uniform float u_exposure,u_bloom,u_range;
out vec4 frag;
vec3 srgb(vec3 c){return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(vec3(.0031308),c));}
void main(){
  vec3 c=texture(u_scene,uv).rgb/u_range;
  c+=(texture(u_near,uv).rgb*.7+texture(u_far,uv).rgb*.3)*u_bloom;
  c*=u_exposure;
  // Max-channel luminance-preserving shoulder retains jewel hues at highlights.
  float peak=max(c.r,max(c.g,c.b));
  c*=1./(1.+peak);
  c=srgb(max(c,vec3(0.)));
  float grain=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5;
  frag=vec4(clamp(c+grain/255.,0.,1.),1.);
}`;
