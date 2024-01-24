import {gpgpu} from './gpgpu.js'
const ppngVoxelShader = `#version 300 es
precision highp float;

// PPNG size parameters
uniform int Q;
uniform int R;
uniform int F;

// indexing parameters
uniform int voxelSize;

uniform sampler2D ppng1x;
uniform sampler2D ppng1y;
uniform sampler2D ppng1z;

const int canvasMaxWidth = 16384;

// output (4 channel half floats)
out vec4 outColor;

void main() {
    // indexing Fx2xQxQxQ
    int voxelFlatIndex = int(gl_FragCoord.y) * canvasMaxWidth + int(gl_FragCoord.x);
    if (voxelFlatIndex > voxelSize) {
        discard;
    }

    int xi = (voxelFlatIndex % Q);
    int yi = ((voxelFlatIndex / (Q)) % Q);
    int zi = ((voxelFlatIndex / (Q*Q)) % Q);
    int fi = ((voxelFlatIndex / (Q*Q*Q)) % (F*2));

    // Fx2*QxQxRxC
    outColor = vec4(0.0, 0.0, 0.0, 0.0);
    for(int r = 0; r < R; r++){
        int qyz_z = fi * Q + zi;
        int qyz_y = yi * R + r;

        int qxz_z = fi * Q + zi;
        int qxz_x = xi * R + r;

        int qxy_y = fi * Q + yi;
        int qxy_x = xi * R + r;

        vec4 qxv = texelFetch(ppng1x, ivec2(qyz_y, qyz_z), 0);
        vec4 qyv = texelFetch(ppng1y, ivec2(qxz_x, qxz_z), 0);
        vec4 qzv = texelFetch(ppng1z, ivec2(qxy_x, qxy_y), 0);

        outColor += (qxv * qyv * qzv);
    }
}
`;


export function ppng2Toppng3(F, Q, R, ppng2){
  const voxelSize = F*2*Q*Q*Q;
  const outType = 'float16';
  const uniforms = {
    'Q': {type: 'int', value: Q},
    'R': {type: 'int', value: R},
    'F': {type: 'int', value: F},
    'voxelSize': {type: 'int', value: voxelSize},
    'ppng1x': {type: 'sampler2D', value: ppng2[0], options: {width: Q*R, height: F*2*Q, sampling:'nearest'}},
    'ppng1y': {type: 'sampler2D', value: ppng2[1], options: {width: Q*R, height: F*2*Q, sampling:'nearest'}},
    'ppng1z': {type: 'sampler2D', value: ppng2[2], options: {width: Q*R, height: F*2*Q, sampling:'nearest'}},
  };
  const ppng3 = gpgpu(voxelSize, outType, uniforms, ppngVoxelShader)
  return ppng3;
}
