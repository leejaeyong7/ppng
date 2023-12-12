import {gpgpu} from './gpgpu.js'
const qffVoxelShader = `#version 300 es
precision highp float;

// QFF size parameters
uniform int Q;
uniform int R;
uniform int F;

// indexing parameters
uniform int voxelSize;

uniform sampler2D qff1x;
uniform sampler2D qff1y;
uniform sampler2D qff1z;

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
    // Fx2*QxRxC
    outColor = vec4(0.0, 0.0, 0.0, 0.0);
    for(int r = 0; r < R; r++){
        int qxi = fi * Q*R + xi * R + r;
        int qyi = fi * Q*R + yi * R + r;
        int qzi = fi * Q*R + zi * R + r;
        vec4 qxv = texelFetch(qff1x, ivec2(qxi, 0), 0);
        vec4 qyv = texelFetch(qff1y, ivec2(qyi, 0), 0);
        vec4 qzv = texelFetch(qff1z, ivec2(qzi, 0), 0);

        outColor += (qxv * qyv * qzv);
    }
}
`;


export function qff1Toqff3(F, Q, R, qff1){
  const voxelSize = F*2*Q*Q*Q;
  const outType = 'float16';
  const uniforms = {
    'Q': {type: 'int', value: Q},
    'R': {type: 'int', value: R},
    'F': {type: 'int', value: F},
    'voxelSize': {type: 'int', value: voxelSize},
    'qff1x': {type: 'sampler2D', value: qff1[0], options: {width: F*2*Q*R, height: 1, sampling:'nearest'}},
    'qff1y': {type: 'sampler2D', value: qff1[1], options: {width: F*2*Q*R, height: 1, sampling:'nearest'}},
    'qff1z': {type: 'sampler2D', value: qff1[2], options: {width: F*2*Q*R, height: 1, sampling:'nearest'}},
  };
  const qff3 = gpgpu(voxelSize, outType, uniforms, qffVoxelShader)
  return qff3;
}
