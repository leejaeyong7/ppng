import {gpgpu} from './gpgpu.js'
const gridShader = `#version 300 es
precision highp float;
precision highp sampler3D;

// QFF size parameters
uniform int Q;
uniform int G;
uniform int F;


// indexing parameters
uniform int voxelSize;

uniform sampler3D[8] qff_textures;
uniform float density_bias;

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
    float density = min(density_layer(feats) + density_bias, 11.0);
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

    // within 0 to 1 range
    vec3 p = vec3(float(xi), float(yi), float(zi)) / float(G - 1);

    // within -1 to 1 range
    // p = (p - 0.5) * 2.0;
    float density = query(p);

    float alpha = 1.0 - exp(-density * 1.7 / 1024.0 );
    outColor.r = alpha;
}
`;

export function gridFromqff3(F, Q, G, qff3, density_vectors, density_bias, freqs){
  const voxelSize = G*G*G;
  const outType = 'float16';
  console.log(freqs)
  const uniforms = {
    'Q': {type: 'int', value: Q},
    'G': {type: 'int', value: G},
    'F': {type: 'int', value: F},
    'freqs': {type: 'floatArray', value: freqs},
    'voxelSize': {type: 'int', value: voxelSize},
    'qff_textures': {type: 'sampler3DArray', value: qff3, options: {width: Q, height: Q, depth: Q, sampling:'linear'}},
    'density_vectors': {type: 'vec4Array', value: density_vectors},
    'density_bias': {type: 'float', value: density_bias}
  };
  const grid = gpgpu(voxelSize, outType, uniforms, gridShader, 1)
  return grid;
}
