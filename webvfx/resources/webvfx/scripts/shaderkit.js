// Copyright (c) 2011 Hewlett-Packard Development Company, L.P. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

var WebVfx = WebVfx || {};


////////

// canvas - canvas HTML element
WebVfx.Renderer = function (canvas) {
    this.gl = canvas.getContext("experimental-webgl");
    if (!this.gl)
        throw "This browswer does not have WebGL enabled.";
    this.buildQuad();
}

WebVfx.Renderer.prototype.buildQuad = function () {
    var gl = this.gl;

    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,
                  new Float32Array([ 0, 0, 0, 1, 1, 0, 1, 1 ]),
                  gl.STATIC_DRAW);
}

// shader - Shader to render
// renderTarget - optional RenderTarget, if not specified then render to canvas
WebVfx.Renderer.prototype.render = function (shader, renderTarget) {
    var gl = this.gl;

    if (renderTarget)
        renderTarget.setCurrent(true);

    // Should use gl.drawingBufferWidth/Height but they aren't implemented
    gl.viewport(0, 0, gl.canvas.clientWidth, gl.canvas.clientHeight);

    shader.render();

    if (renderTarget)
        renderTarget.setCurrent(false);
}

////////

WebVfx.RenderTarget = function (renderer) {
    this.renderer = renderer;
    var gl = renderer.gl;
    this.texture = gl.createTexture();
    this.framebuffer = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    // Set parameters to support NPOT textures
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    //XXX should listen for canvas size changes and recreate
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);

    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

WebVfx.RenderTarget.prototype.setCurrent = function (current) {
    var gl = this.renderer.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, current ? this.framebuffer : null);
}

WebVfx.RenderTarget.prototype.destroy = function () {
    var gl = this.renderer.gl;
    gl.deleteTexture(this.texture);
    this.texture = null;
    gl.deleteFramebuffer(this.framebuffer);
    this.framebuffer = null;
}

////////

// renderer - Renderer
// shaderSource - fragment shader source code
// uniforms - optional hash mapping uniform name to initial value
WebVfx.Shader = function (renderer, shaderSource, uniforms) {
    this.renderer = renderer;
    var gl = renderer.gl;
    this.program = this.compileProgram(shaderSource);
    this.uniforms = this.extractUniforms();
    // Set default values if specified
    if (uniforms) {
        gl.useProgram(this.program);
        for (var name in uniforms)
            this.uniforms[name].setValue(uniforms[name]);
    }
    this.vertexAttribute = gl.getAttribLocation(this.program, 'vertex');
    gl.vertexAttribPointer(this.vertexAttribute, 2, gl.FLOAT, false, 0, 0);
}

WebVfx.Shader.prototype.render = function () {
    var gl = this.renderer.gl;
    for (var name in this.uniforms)
        this.uniforms[name].bind();
    gl.useProgram(this.program);
    gl.enableVertexAttribArray(this.vertexAttribute);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(this.vertexAttribute);
}

WebVfx.Shader.prototype.destroy = function () {
    var gl = this.renderer.gl;
    for (var name in this.uniforms)
        this.uniforms[name].destroy();
    gl.deleteProgram(this.program);
    this.program = null;
}

// Return the script text from a <script type="x-shader/x-fragment">
// element of the given ID.
WebVfx.Shader.loadShader = function (shaderId) {
    var shaderScript = document.getElementById(shaderId);
    if (!shaderScript || shaderScript.type != "x-shader/x-fragment") {
        throw "Could not find shader script ID " + shaderId +
                    " of type x-shader/x-fragment";
    }
    return shaderScript.text;
}

// Update an existing uniforms value
WebVfx.Shader.prototype.updateUniform = function (name, value) {
    var uniform = this.uniforms[name];
    if (!uniform) {
        console.warn("Invalid uniform name " + name);
        return;
    }
    this.renderer.gl.useProgram(this.program);
    uniform.setValue(value);
}

WebVfx.Shader.VERTEX_SHADER_SOURCE = [
    "attribute vec2 vertex;",
    "varying vec2 texCoord;",
    "void main() {",
    "    texCoord = vertex;",
    "    gl_Position = vec4(vertex * 2.0 - 1.0, 0.0, 1.0);",
    "}"].join("\n");

WebVfx.Shader.prototype.compileProgram = function (shaderSource) {
    var gl = this.renderer.gl;
    var program = gl.createProgram();

    var vs = this.compileSource(gl.VERTEX_SHADER,
                                WebVfx.Shader.VERTEX_SHADER_SOURCE);
    var fs = this.compileSource(gl.FRAGMENT_SHADER, shaderSource);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw 'link error: ' + gl.getProgramInfoLog(program);

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    return program;
}

WebVfx.Shader.prototype.compileSource = function (type, shaderSource) {
    var gl = this.renderer.gl;
    var shader = gl.createShader(type);
    gl.shaderSource(shader, shaderSource);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw 'compile error: ' + gl.getShaderInfoLog(shader);
    return shader;
}

// Extract uniform declarations from program
WebVfx.Shader.prototype.extractUniforms = function () {
    var gl = this.renderer.gl;
    var textureCount = 0;
    var uniforms = {};

    gl.useProgram(this.program);

    var uniformCount = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
    for (var u = 0; u < uniformCount; u++) {
        var info = gl.getActiveUniform(this.program, u);
        var location = gl.getUniformLocation(this.program, info.name);

        if (info.type == gl.SAMPLER_2D)
            uniforms[info.name] = new WebVfx.Texture(gl, textureCount++, location);
        else
            uniforms[info.name] = new WebVfx.Uniform(gl, info.type, location);
    }
    return uniforms;
}

////////

// type - uniform type
// location - uniform location
WebVfx.Uniform = function (gl, type, location) {
    this.gl = gl;

    this.uniformLocation = location;

    switch (type) {
    case gl.FLOAT:
        this.uniformFunction = gl.uniform1f;
        break;
    case gl.INT:
    case gl.BOOL:
        this.uniformFunction = gl.uniform1i;
        break;
    case gl.FLOAT_VEC2:
        this.uniformFunction = gl.uniform2fv;
        this.wrapperConstructor = Float32Array;
        break;
    case gl.FLOAT_VEC3:
        this.uniformFunction = gl.uniform3fv;
        this.wrapperConstructor = Float32Array;
        break;
    case gl.FLOAT_VEC4:
        this.uniformFunction = gl.uniform4fv;
        this.wrapperConstructor = Float32Array;
        break;
    case gl.INT_VEC2:
    case gl.BOOL_VEC2:
        this.uniformFunction = gl.uniform2iv;
        this.wrapperConstructor = Int32Array;
        break;
    case gl.INT_VEC3:
    case gl.BOOL_VEC3:
        this.uniformFunction = gl.uniform3iv;
        this.wrapperConstructor = Int32Array;
        break;
    case gl.INT_VEC4:
    case gl.BOOL_VEC4:
        this.uniformFunction = gl.uniform4iv;
        this.wrapperConstructor = Int32Array;
        break;
    default:
        throw 'Unsupported uniform type ' + type;
    }
}

// Set uniform value, can be float or array of floats
WebVfx.Uniform.prototype.setValue = function(value) {
    this.value = value;
    if (this.wrapperConstructor)
        value = new this.wrapperConstructor(value);
    this.uniformFunction.call(this.gl, this.uniformLocation, value);
}

WebVfx.Uniform.prototype.bind = function() {
    // do nothing
}

WebVfx.Uniform.prototype.destroy = function() {
    // do nothing
}

////////

// unit - texture unit, 0-7
// location - uniform location
WebVfx.Texture = function (gl, unit, location) {
    this.gl = gl;
    this.unit = unit;

    gl.uniform1i(location, this.unit);
}

// Value can be a RenderTarget, SharedTexture or an image to upload image into a texture.
// The image can have textureOptions which map texParameteri enums to values.
WebVfx.Texture.prototype.setValue = function(image) {
    var gl = this.gl;

    if (image instanceof WebVfx.RenderTarget || image instanceof WebVfx.SharedTexture) {
        this.id = image.texture;
    }
    else {
        if (!this.id) {
            this.id = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.id);
            // Set parameters to support NPOT textures
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        }

        if (image.textureOptions) {
            for (var opt in image.textureOptions)
                gl.texParameteri(gl.TEXTURE_2D, opt, image.textureOptions[opt]);
        }
        gl.bindTexture(gl.TEXTURE_2D, this.id);
        // Flip texture vertically so it's not upside down
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    }
}

WebVfx.Texture.prototype.bind = function() {
    if (!this.id)
        return;
    var gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + this.unit);
    gl.bindTexture(gl.TEXTURE_2D, this.id);
}

WebVfx.Texture.prototype.destroy = function() {
    if (this.id) {
        this.gl.deleteTexture(this.id);
        this.id = null;
    }
}

////////

WebVfx.SharedTexture = function (renderer) {
    this.renderer = renderer;
    var gl = renderer.gl;
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    // Set parameters to support NPOT textures
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
}

WebVfx.SharedTexture.prototype.setImage = function(image) {
    var gl = this.renderer.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    // Flip texture vertically so it's not upside down
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
}