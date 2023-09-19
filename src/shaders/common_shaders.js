const defaultVertexShader = `#version 300 es
in vec4 position;
void main() {
  gl_Position = position;
}
`;

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
    int yi = (voxelFlatIndex / (Q) % Q);
    int zi = (voxelFlatIndex / (Q*Q) % Q);
    int fi = (voxelFlatIndex / (Q*Q*Q) % (F*2));
    // FxQxRxC
    for(int r = 0; r < R; r++){
        int qxi = fi * Q*R + xi * R + r;
        int qyi = fi * Q*R + yi * R + r;
        int qzi = fi * Q*R + zi * R + r;
        vec4 qxv = texelFetch(qff1x, ivec2(qxi, 0), 0);
        vec4 qyv = texelFetch(qff1y, ivec2(qyi, 0), 0);
        vec4 qzv = texelFetch(qff1z, ivec2(qzi, 0), 0);
    }
    outColor = vec4(xi, yi, zi, fi);
}
`;