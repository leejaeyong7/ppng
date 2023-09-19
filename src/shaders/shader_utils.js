const defaultVertexShader = `#version 300 es
in vec4 position;
void main() {
  gl_Position = position;
}
`;

export function createShader(gl, sourceCode, type) {
    // Compiles either a shader of type gl.VERTEX_SHADER or gl.FRAGMENT_SHADER
    const shader = gl.createShader(type);
    gl.shaderSource(shader, sourceCode);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        throw `Could not compile WebGL program. \n\n${info}`;
    }
    return shader;
}
export function createProgramFromSources(gl, [vs, fs]) {
    const program = gl.createProgram();
    const vertexShader = createShader(gl, vs, gl.VERTEX_SHADER);
    const fragmentShader = createShader(gl, fs, gl.FRAGMENT_SHADER);
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    return program;
}

export function createProgramFromFragShader(gl, fs) {
    return createProgramFromSources(gl, [defaultVertexShader, fs]);
}


export function setupDefaultVAO(gl, program){
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    // setup the vertex buffer
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 
    1, -1,
    -1,  1,
    -1,  1,
    1, -1,
    1,  1,
    ]), gl.STATIC_DRAW);

    const positionLoc = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer( positionLoc, 2, gl.FLOAT, false, 0, 0);
    return vao;
}
function setupNonTextureUniform(gl, uniformLoc, type, value){
    switch(type){
        case 'int':
            gl.uniform1i(uniformLoc, value);
            break;
        case 'float':
            gl.uniform1f(uniformLoc, value);
            break;
        case 'vec2':
            gl.uniform2fv(uniformLoc, value);
            break;
        case 'vec3':
            gl.uniform3fv(uniformLoc, value);
            break;
        case 'vec4':
            gl.uniform4fv(uniformLoc, value);
            break;
        case 'mat2':
            gl.uniformMatrix2fv(uniformLoc, false, value);
            break;
        case 'mat3':
            gl.uniformMatrix3fv(uniformLoc, false, value);
            break;
        case 'mat4':
            gl.uniformMatrix4fv(uniformLoc, false, value);
            break;
        default:
            throw "Unsupported uniform type";
    }
}
function setupTextureUniform(gl, type, value, options, texUnit){
    gl.activeTexture(gl.TEXTURE0 + texUnit);
    const texture = createTexture(gl, type, value, options)
    switch(type){
        case 'sampler2D':
            gl.bindTexture(gl.TEXTURE_2D, texture);
            break;
        case 'sampler3D':
            gl.bindTexture(gl.TEXTURE_3D, texture);
            break;
        default:
            throw "Unsupported texture type";
    }
}

export function setupUniforms(gl, program, uniforms){
    let textureUnit = 0;
    Object.entries(uniforms).forEach(([name, uniform]) => {
        if (uniform.type.startsWith('sampler')){
            const uniformLoc = gl.getUniformLocation(program, name);
            if(uniform.type.endsWith('Array')){
                const texUnits = []
                uniform.value.forEach((tArray, i) => {
                    // const uniformLoc = gl.getUniformLocation(program, `${name}[${i}]`);
                    setupTextureUniform(gl, uniform.type.slice(0, -5), tArray, uniform.options, textureUnit)
                    texUnits.push(textureUnit);
                    // gl.uniform1i(uniformLoc, textureUnit);
                    textureUnit++;
                });
                gl.uniform1iv(uniformLoc, texUnits);
            } else {
                const uniformLoc = gl.getUniformLocation(program, name);
                setupTextureUniform(gl, uniform.type, uniform.value, uniform.options, textureUnit)
                gl.uniform1i(uniformLoc, textureUnit);
                textureUnit++;
            }
        } else if (uniform.type.endsWith('Array')){
            uniform.value.forEach((v, i) => {
                const uniformLoc = gl.getUniformLocation(program, `${name}[${i}]`);
                setupNonTextureUniform(gl, uniformLoc, uniform.type.slice(0, -5), v);
            });
        } else {
            const uniformLoc = gl.getUniformLocation(program, name);
            setupNonTextureUniform(gl, uniformLoc, uniform.type, uniform.value);
        }
    });
}

export function setupFBO(gl, outWidth, outHeight, outType, outChannels){
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);

    const outTex = gl.createTexture(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, outTex);
    if(outType === 'float32'){
        gl.texImage2D(gl.TEXTURE_2D, 0, outChannels == 4 ? gl.RGBA32F : gl.R32F, outWidth, outHeight, 0,outChannels == 4 ? gl.RGBA: gl.RED, gl.FLOAT, null);
    }else if(outType === 'float16'){
        gl.texImage2D(gl.TEXTURE_2D, 0, outChannels == 4 ? gl.RGBA16F: gl.R16F, outWidth, outHeight, 0, outChannels == 4 ? gl.RGBA: gl.RED, gl.HALF_FLOAT, null);
    } else if(outType === 'uint8'){
        gl.texImage2D(gl.TEXTURE_2D, 0, outChannels == 4 ? gl.RGBA: gl.R8, outWidth, outHeight, 0, outChannels == 4 ? gl.RGBA: gl.RED, gl.UNSIGNED_BYTE, null);
    } else {
        throw "Unsupported output type";
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outTex, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0])
    return {fb, outTex};
}

function createTexture(gl, type, array, options){
    const width = options.width;
    const height = options.height;
    const texture = gl.createTexture();
    if(type === 'sampler2D'){
        gl.bindTexture(gl.TEXTURE_2D, texture);

        if(array instanceof Float32Array){
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, array)
        }else if(array instanceof Uint16Array){
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, array)
        } else if (array instanceof Uint8Array){
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, array)
        } else {
            throw "Unsupported texture type";
        }

        if(options.sampling == 'nearest'){
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        } else {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        }

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0);
    } else if (type === 'sampler3D'){
        const depth = options.depth;
        gl.bindTexture(gl.TEXTURE_3D, texture);
        if(array instanceof Float32Array){
            gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA32F, width, height, depth, 0, gl.RGBA, gl.FLOAT, array)
        }else if(array instanceof Uint16Array){
            gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, width, height, depth, 0, gl.RGBA, gl.HALF_FLOAT, array)
        } else if (array instanceof Uint8Array){
            gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA, width, height, depth, 0, gl.RGBA, gl.UNSIGNED_BYTE, array)
        } else {
            throw "Unsupported texture type";
        }

        if(options.sampling == 'nearest'){
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        } else {
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        }

        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_BASE_LEVEL, 0);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAX_LEVEL, 0);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    return texture;
  }
