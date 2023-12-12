import * as THREE from 'three';
import {qffVertShader, qffFragShader} from './shaders/qff_shaders.js';


export default class QFFMesh extends THREE.Object3D{
    constructor(F, Q, G, freqs, qff_textures_data, grids_texture_data, density_layer_data, rgb_layers_data, grid_th, aabb_scale, min_alpha, render_step){
        super();
        const qff_textures = qff_textures_data.map(qff_texture_data =>{
            const qff_texture = new THREE.Data3DTexture(qff_texture_data, Q, Q, Q);
            qff_texture.format = THREE.RGBAFormat;
            qff_texture.type = THREE.HalfFloatType;
            qff_texture.minFilter = qff_texture.magFilter = THREE.LinearFilter;
            qff_texture.unpackAlignment = 1;
            qff_texture.needsUpdate = true;
            return qff_texture;
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
        console.log(render_step)

        const uniforms = {
            'num_freqs': {value: F},
            'num_quants': {value: Q},
            'qff_textures': {value: qff_textures},
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
            vertexShader: qffVertShader,
            fragmentShader: qffFragShader,
            side: THREE.BackSide,
        });

        // create just empty mesh
        const dummy_mesh = new THREE.Mesh(geom, material)
        dummy_mesh.position.set(0.5, 0.5, 0.5)
        this.add(dummy_mesh);
    }
}
