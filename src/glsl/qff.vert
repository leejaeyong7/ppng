precision highp float;
varying vec3 vOrigin;
varying vec3 vDirection;

void main() {
    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    vOrigin = cameraPosition;
    vec3 pp = vec3((modelMatrix * vec4(position, 1.0)).xyz);
    vDirection = pp - vOrigin;
    gl_Position = projectionMatrix * mvPosition;
}