import {gpgpu} from './gpgpu.js'
const gridShader = `#version 300 es
precision highp float;
precision highp sampler3D;

// QFF size parameters
uniform int Q;
uniform int G;
uniform int F;
uniform int D;
uniform int M;
uniform float mipscale;

// indexing parameters
uniform int voxelSize;

uniform sampler3D prev_grid;
uniform sampler3D[8] qff_textures;

uniform vec4[8] density_vectors;
uniform float[4] freqs;

const float TWO_PI = 6.28318530718;
const int canvasMaxWidth = 16384;

// output (4 channel bytes, but only use 1)
out vec4 outColor;

vec4 z = vec4(0.0, 0.0, 0.0, 0.0);

float density_layer(vec4[8] qff_values){
    float density = 0.0;

    for( int fid = 0; fid < F; fid++){
        density += dot(density_vectors[fid], qff_values[fid]);
    }
    return density;
}

float query(vec3 p) {
    vec4 feats[8] = vec4[8](z, z, z, z, z, z, z, z);

    for (int fid = 0; fid < F; fid++){
        float f = freqs[fid];
        vec3 sp = (sin(mod(f * p, TWO_PI)) * float(Q - 1) / float(Q)) / 2.0 + 0.50;
        vec3 cp = (cos(mod(f * p, TWO_PI)) * float(Q - 1) / float(Q)) / 2.0 + 0.50;

        switch(fid){
            case 0:
                feats[0] = texture(qff_textures[0], sp);
                feats[1] = texture(qff_textures[1], cp);
                break;
            case 1:
                feats[2] = texture(qff_textures[2], sp);
                feats[3] = texture(qff_textures[3], cp);
                break;
            case 2:
                feats[4] = texture(qff_textures[4], sp);
                feats[5] = texture(qff_textures[5], cp);
                break;
            case 3:
                feats[6] = texture(qff_textures[6], sp);
                feats[7] = texture(qff_textures[7], cp);
                break;
        }
    }


    // obtain density features
    float density = min(density_layer(feats), 11.0);
    return exp(density);
}


void main() {
    // indexing GxGxG
    int voxelFlatIndex = int(gl_FragCoord.y) * canvasMaxWidth + int(gl_FragCoord.x);
    if (voxelFlatIndex > voxelSize) {
        discard;
    }

    int xi = (voxelFlatIndex % G);
    int yi = (voxelFlatIndex / (G) % G);
    int zi = (voxelFlatIndex / (G*G) % G);
    int mi = (voxelFlatIndex / (G*G*G));

    float scale = pow(mipscale, float(mi));
    vec3 p = vec3(float(xi), float(yi), float(zi)) / float(G - 1);
    vec3 cp = ((p - 0.5) / scale) + 0.5;

    float density = query(cp);
    outColor.r = density;
    return;
}
`;
const sumShader = `#version 300 es
precision highp float;
precision highp sampler3D;

// QFF size parameters
uniform int G;
uniform int M;
uniform float mipscale;

// indexing parameters
uniform int voxelSize;

uniform sampler3D[16] grids;
const int canvasMaxWidth = 16384;

// output (4 channel bytes, but only use 1)
out vec4 outColor;

vec4 z = vec4(0.0, 0.0, 0.0, 0.0);

void main() {
    // indexing GxGxG
    int voxelFlatIndex = int(gl_FragCoord.y) * canvasMaxWidth + int(gl_FragCoord.x);
    if (voxelFlatIndex > voxelSize) {
        discard;
    }
    // given grids of mip levels 0 to 4, compute the maximum density at the mip level of 0. 
    // i.e, if the coarse density is a maximum of all finer densities. 
    int xi = (voxelFlatIndex % G);
    int yi = (voxelFlatIndex / (G) % G);
    int zi = (voxelFlatIndex / (G*G) % G);

    // get the query point
    vec3 p = vec3(float(xi), float(yi), float(zi)) / float(G - 1);
    vec3 cp = abs(p - 0.5) * 2.0; 
    float mp = max(max(cp.x, cp.y), cp.z);
    int mip = max(min(int(-log(mp) / log(mipscale)), M - 1), 0);

    float density = 0.0;
    for (int mi = 0; mi < M; mi++){
      if(mi > mip){
        break;
      }

      float scale = pow(mipscale, float(mi));
      vec3 sp = ((p - 0.5) / scale) + 0.5;
      switch(mi){
        case 0:
          density = max(texture(grids[0], sp).r, density);
          break;
        case 1:
          density = max(texture(grids[1], sp).r, density);
          break;
        case 2:
          density = max(texture(grids[2], sp).r, density);
          break;
        case 3:
          density = max(texture(grids[3], sp).r, density);
          break;
        case 4:
          density = max(texture(grids[4], sp).r, density);
          break;
        case 5:
          density = max(texture(grids[5], sp).r, density);
          break;
        case 6:
          density = max(texture(grids[6], sp).r, density);
          break;
        case 7:
          density = max(texture(grids[7], sp).r, density);
          break;
        case 8:
          density = max(texture(grids[8], sp).r, density);
          break;
        case 9:
          density = max(texture(grids[9], sp).r, density);
          break;
        case 10:
          density = max(texture(grids[10], sp).r, density);
          break;
        case 11:
          density = max(texture(grids[11], sp).r, density);
          break;
        case 12:
          density = max(texture(grids[12], sp).r, density);
          break;
        case 13:
          density = max(texture(grids[13], sp).r, density);
          break;
        case 14:
          density = max(texture(grids[14], sp).r, density);
          break;
        case 15:
          density = max(texture(grids[15], sp).r, density);
          break;
      }
    }

    outColor.r = density;
    return;
}
`;

export function gridFromqff3(F, Q, G, qff3, density_vectors, freqs, num_mips=1){
  const gridsVoxelSize = num_mips * G*G*G;
  const gridVoxelSize = G*G*G;
  const outType = 'float16';
  const mip_scale = 2.00;
  const gridsUniforms = {
    'Q': {type: 'int', value: Q},
    'G': {type: 'int', value: G},
    'F': {type: 'int', value: F},
    'M': {type: 'int', value: num_mips},
    'mipscale': {type: 'float', value: mip_scale},
    'freqs': {type: 'floatArray', value: freqs},
    'voxelSize': {type: 'int', value: gridsVoxelSize},
    'qff_textures': {type: 'sampler3DArray', value: qff3, options: {width: Q, height: Q, depth: Q, sampling:'linear'}},
    'density_vectors': {type: 'vec4Array', value: density_vectors}
  };
  const grids = gpgpu(gridsVoxelSize, outType, gridsUniforms, gridShader, 4)
  const grid_samplers = Array.from({length:num_mips}, (v, i)=>grids.slice(i * gridVoxelSize * 4, (i+1) * gridVoxelSize * 4));

  const gridUniforms = {
    'G': {type: 'int', value: G},
    'M': {type: 'int', value: num_mips},
    'mipscale': {type: 'float', value: mip_scale},
    'voxelSize': {type: 'int', value: gridVoxelSize},
    'grids': {type: 'sampler3DArray', value: grid_samplers, options: {width: G, height: G, depth: G, sampling:'nearest'}},
  };
  const grid = gpgpu(gridVoxelSize, outType, gridUniforms, sumShader, 1)
  return grid;
}
