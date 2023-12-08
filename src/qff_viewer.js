import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {qff1Toqff3} from './shaders/qff1_to_qff3.js';
import {gridFromqff3} from './shaders/grid_from_qff3.js';
import QFFMesh from './qff_mesh.js';
import * as cbor from 'cbor-web';
import { Float16Array, getFloat16 } from '@petamoriken/float16';

// ES Modules


export default class QFFViewer extends HTMLElement{
    constructor(){
        super({antialias: false})
        this.should_render = true;
        // setup camera
        this.fov = 45;
        this.aspect = 4.0 / 4.0;
        this.near = 0.01;
        this.far = 5;

        const src = this.getAttribute('src');

        // 
        const self = this;
        this.renderer = new THREE.WebGLRenderer( { antialias: false} );
        this.style.width = `${this.width}px`;
        this.style.height = `${this.height}px`;
        this.renderer.setPixelRatio(1);
        // this.renderer.setSize(this.width, this.height, false);
        this.renderer.setSize(800, 800, false);
        this.renderer.domElement.style.width = `100%`;
        this.renderer.domElement.style.height = `100%`;
        this.appendChild(this.renderer.domElement);
        this.camera = new THREE.PerspectiveCamera(this.fov, this.aspect, this.near, this.far);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.addEventListener('change', function(event){ self.should_render = true; })
        this.controls.update();


        // setup scene
        this.scene = new THREE.Scene();
        function animate(){
            requestAnimationFrame(animate);
            self.controls.update()
            if(self.should_render){
                console.log('rendered')
                self.renderer.render(self.scene, self.camera);
                self.should_render = false;
            }
        }
        animate();

        this.loadPromise = fetch(src);
        this.loadPromise.then(async (response) => {
            const buf = await response.arrayBuffer();
            console.time('extracting')
            const qffMesh = await this.onBufferLoad(buf);
            this.scene.add(qffMesh)
            this.should_render = true;
            console.timeEnd('extracting')
        }).catch((error) => {
            console.error(error)
        });
    }


    load_pose(pose) {
        const pose_mat = new THREE.Matrix4().set(
            pose[0][0],-pose[0][1],-pose[0][2], pose[0][3],
            pose[1][0],-pose[1][1],-pose[1][2], pose[1][3],
            pose[2][0],-pose[2][1],-pose[2][2], pose[2][3],
            0, 0, 0, 1
        );
        const cam_pos = new THREE.Vector3();
        const cam_rot = new THREE.Quaternion();
        const cam_s = new THREE.Vector3();
        pose_mat.decompose(cam_pos, cam_rot, cam_s)
        let up = new THREE.Vector3(-pose[0][1], -pose[1][1], -pose[2][1]);

        this.camera.setRotationFromQuaternion(cam_rot);
        this.camera.position.copy(cam_pos);
        this.camera.updateMatrix()
        this.camera.up.copy(up);


        let front = new THREE.Vector3(0.5, 0.5, 0.5);
        // let front = new THREE.Vector3(-pose[0][2], -pose[1][2], -pose[2][2]);
        // this.camera.getWorldDirection(front);

        // front = front.multiplyScalar(0.01).add(cam_pos);
        // remove old control object
        if (this.controls){
            this.controls.dispose();
        }
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        const self = this;
        this.controls.addEventListener('change', function(event){ self.should_render = true; })
        this.controls.update();

        this.camera.setRotationFromQuaternion(cam_rot);
        this.camera.position.copy(cam_pos);
        this.camera.updateMatrix()
        this.camera.up.copy(up);
        this.controls.target.set(front.x, front.y, front.z);
        this.controls.target0.set(front.x, front.y, front.z);
    }



    async onBufferLoad(buffer){
        function loadCBORBuffer(buf){
            const arrBuf = new ArrayBuffer(buf.length);
            const byteBuf = new Uint8Array(arrBuf)
            byteBuf.set(buf);
            return arrBuf;
        }
        console.time('decoding')
        const data = await cbor.decodeFirst(buffer);
        const qff_buffer= new Uint16Array(loadCBORBuffer(data['qff_buffer']))
        const freqs = data['freqs'];
        const F = data['n_freqs'];
        const G = data['grid_res'];
        const C = data['n_feats'];
        const Q = data['n_quants'];
        const R = data['rank'];
        const density_bias = data['density_bias'];
        const render_step = data['render_step'];
        const up = data['up'];
        const initial_pose = data['initial_pose'];
        const qff_density_raw_layer = new Float32Array(loadCBORBuffer(data['qff_density_layer']));
        const qff_density_raw_vectors = new Float32Array(loadCBORBuffer(data['qff_density_vectors']));
        const qff_rgb_raw_layer_0 = new Float32Array(loadCBORBuffer(data['qff_rgb_layer_0']));
        const qff_rgb_raw_layer_1 = new Float32Array(loadCBORBuffer(data['qff_rgb_layer_1']));
        const qff_1_chunk_size = F*2*Q*R*C;
        const qff_x = qff_buffer.slice(0*qff_1_chunk_size, 1*qff_1_chunk_size)
        const qff_y = qff_buffer.slice(1*qff_1_chunk_size, 2*qff_1_chunk_size)
        const qff_z = qff_buffer.slice(2*qff_1_chunk_size, 3*qff_1_chunk_size)

        console.timeEnd('decoding')
        console.time('decompression')
        const qff3_buffer = qff1Toqff3(F, Q, R, [qff_x, qff_y, qff_z]);
        console.timeEnd('decompression')
        const qff3_buffers = Array.from({length: F*2}, (v, i) => qff3_buffer.slice(i*Q*Q*Q*4, (i+1)*Q*Q*Q*4));  
        const qff_density_vectors = Array.from({length: qff_density_raw_vectors.length / 4}, (v, i) => qff_density_raw_vectors.slice(i*4, (i+1)*4));
        console.time('gridCache')
        const grid = gridFromqff3(F, Q, G, qff3_buffers, qff_density_vectors, density_bias, freqs);
        console.timeEnd('gridCache')
        this.load_pose(initial_pose);

        const qff_density_layer = Array.from({length: qff_density_raw_layer.length / 16}, (v, i) => qff_density_raw_layer.slice(i*16, (i+1)*16));
        const qff_rgb_layer_0 = Array.from({length: qff_rgb_raw_layer_0.length / 16}, (v, i) => qff_rgb_raw_layer_0.slice(i*16, (i+1)*16));
        const qff_rgb_layer_1 = Array.from({length: qff_rgb_raw_layer_1.length / 16}, (v, i) => qff_rgb_raw_layer_1.slice(i*16, (i+1)*16));
        // debugger;

        // setup QFF mesh
        return new QFFMesh(F, Q, G, freqs, qff3_buffers, grid, qff_density_layer, qff_rgb_layer_0, qff_rgb_layer_1, density_bias, 0.01, render_step);
    }

    set height(val){
        if(val){
            this.setAttribute('height', val);
        } else {
            this.removeAttribute('height')
        }
        if(this.renderer && this.camera){
            this.onResize();
        }
    }
    get height(){
        return this.getAttribute('height') || 1;
    }
    set width(val){
        if(val){
            this.setAttribute('width', val);
        } else {
            this.removeAttribute('width')
        }
        if(this.renderer && this.camera){
            this.onResize();
        }
    }
    get width(){
        return this.getAttribute('width') || 1;
    }
    setAttribute(name, val){
        super.setAttribute(name, val);
        switch(name){
            case 'width': 
                this.width = val;
                this.onResize();
                break;
            case 'height': 
                this.height = val;
                this.onResize();
                break;
            case 'fov':
                this.camera.fov = this.fov;
                this.onResize();
                break;
            case 'aspect':
                this.camera.aspect = this.aspect;
                this.onResize();
                break;
            case 'near':
                this.camera.near = this.near;
                this.onResize();
                break;
            case 'far':
                this.camera.far = this.far;
                this.onResize();
                break;
        }

    }
    flush(){
        this.should_render = true;
    }

    onFileLoad(){
        if(this.scene.children.length > 0){
            this.scene.remove(this.scene.children[0]);
        }
        this.scene.add(mesh);
    }

    onResize(){
        this.renderer.setSize(this.width, this.height, false);
        this.camera.fov = this.fov;
        this.camera.aspect = this.aspect; 
        this.camera.near = this.near;
        this.camera.far = this.far;
        this.camera.updateProjectionMatrix()
        this.flush();
    }
}
window.THREE = THREE;

customElements.define('qff-viewer', QFFViewer)
