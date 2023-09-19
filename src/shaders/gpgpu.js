import { Float16Array } from "@petamoriken/float16";
import {createProgramFromFragShader, setupDefaultVAO, setupUniforms, setupFBO} from './shader_utils.js';
const CANVAS_MAX_WIDTH = 16384;
const CANVAS_MAX_HEIGHT = 16384;

/**
 * 
 * @param outSize integer value of the number of pixels to compute
 * @param uniforms dict of type {name: {type:'', value: ''}}
 * @param fragmentShader string of the fragment shader code
 */
export function gpgpu(outSize, outType, uniforms, fragmentShader, outChannels=4){
    if(outSize > CANVAS_MAX_WIDTH * CANVAS_MAX_HEIGHT){
        throw "Requested output size is too large";
    }

    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    const ext = gl.getExtension("EXT_color_buffer_half_float");
    const ext2 = gl.getExtension("EXT_color_buffer_float");

    // compute output size
    const outWidth = CANVAS_MAX_WIDTH;
    const outHeight = Math.ceil(outSize/ CANVAS_MAX_WIDTH);

    // setup WebGL program
    const program = createProgramFromFragShader(gl, fragmentShader);

    // setup VAO
    const vao = setupDefaultVAO(gl, program);

    // setup FBO
    const {fb, outTex} = setupFBO(gl, outWidth, outHeight, outType, outChannels);

    // setup viewport
    gl.viewport(0, 0, outWidth, outHeight);
    gl.useProgram(program);

    // setup uniforms
    setupUniforms(gl, program, uniforms);

    // compute
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // retrieve results
    gl.readBuffer(gl.COLOR_ATTACHMENT0)
    let retArr = null;
    if(outType === 'float32'){
        const raw_pixels = new Float32Array(outWidth*outHeight* outChannels);
        gl.readPixels(0, 0, outWidth, outHeight, outChannels == 4 ? gl.RGBA : gl.RED, gl.FLOAT, raw_pixels)
        retArr = raw_pixels.slice(0, outSize*outChannels);
    }else if(outType === 'float16'){
        const raw_pixels = new Uint16Array(outWidth*outHeight* outChannels);
        gl.readPixels(0, 0, outWidth, outHeight, outChannels == 4 ? gl.RGBA : gl.RED, gl.HALF_FLOAT, raw_pixels)
        retArr = raw_pixels.slice(0, outSize*outChannels);
    } else if(outType === 'uint8'){
        const raw_pixels = new Uint8Array(outWidth*outHeight* outChannels);
        gl.readPixels(0, 0, outWidth, outHeight, outChannels == 4 ? gl.RGBA : gl.RED, gl.UNSIGNED_BYTE, raw_pixels)
        retArr = raw_pixels.slice(0, outSize*outChannels);
    } else {
        throw "Unsupported output type";
    }

    // cleanup
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(outTex);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(program);

    return retArr;
}