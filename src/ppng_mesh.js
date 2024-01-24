import * as THREE from 'three';
import {ppngVertShader, ppngFragShader} from './shaders/ppng_shaders.js';


export default class PPNGMesh extends THREE.Object3D{
    constructor(F, Q, G, freqs, ppng_textures_data, grids_texture_data, density_layer_data, rgb_layers_data, grid_th, aabb_scale, min_alpha, render_step){
        super();
        const ppng_textures = ppng_textures_data.map(ppng_texture_data =>{
            const ppng_texture = new THREE.Data3DTexture(ppng_texture_data, Q, Q, Q);
            ppng_texture.format = THREE.RGBAFormat;
            ppng_texture.type = THREE.HalfFloatType;
            ppng_texture.minFilter = ppng_texture.magFilter = THREE.LinearFilter;
            ppng_texture.unpackAlignment = 1;
            ppng_texture.needsUpdate = true;
            return ppng_texture;
        })
        const grid_textures = grids_texture_data.map(grid_texture_data =>{
            const grid_texture = new THREE.Data3DTexture(grid_texture_data, G, G, G);
            grid_texture.format = THREE.RedFormat;
            grid_texture.type = THREE.HalfFloatType;
            grid_texture.minFilter = grid_texture.magFilter = THREE.LinearFilter;
            grid_texture.unpackAlignment = 1;
            grid_texture.needsUpdate = true;
            return grid_texture;
        });

        const density_layer = density_layer_data.map(arr =>{
            return new THREE.Matrix4().fromArray(arr).transpose();
        });
        const rgb_layers = rgb_layers_data.map(rgb_data=>rgb_data.map(arr =>{
            return new THREE.Matrix4().fromArray(arr).transpose();
        }));
        console.log(grid_textures.length)

        const uniforms = {
            'num_freqs': {value: F},
            'num_quants': {value: Q},
            'ppng_textures': {value: ppng_textures},
            'grid_textures': {value: grid_textures.reverse()},
            'grid_res': {value: G},
            'grid_th': {value: grid_th},
            'grid_mips': {value: grid_textures.length},
            'density_weight_0': {value: density_layer},
            'rgb_weight_0': {value: rgb_layers[0]},
            'rgb_weight_1': {value: rgb_layers[1]},
            'min_alpha': {value: min_alpha},
            'aabb_scale': {value: aabb_scale},
            'render_step': {value: render_step},
            'freqs': {value:freqs},
        }

        const geom = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: ppngVertShader,
            fragmentShader: ppngFragShader,
            side: THREE.BackSide,
        });

        // create just empty mesh
        const dummy_mesh = new THREE.Mesh(geom, material)
        dummy_mesh.position.set(0.5, 0.5, 0.5)
        this.add(dummy_mesh);
    }
}
