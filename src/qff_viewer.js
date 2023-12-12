import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {qff1Toqff3} from './shaders/qff1_to_qff3.js';
import {qff2Toqff3} from './shaders/qff2_to_qff3.js';
import {gridFromqff3} from './shaders/grid_from_qff3.js';
import QFFMesh from './qff_mesh.js';
import * as cbor from 'cbor-web';
import { Float16Array, getFloat16, setFloat16 } from '@petamoriken/float16';

// ES Modules
function gridFromRLE(G, rle, val){
    // setup default value in uint16
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    setFloat16(view, 0, val * 100);
    setFloat16(view, 1, 0.0);
    const val16 = view.getUint16(0);
    const unval16 = view.getUint16(1);

    // assign values using RLE
    const grid = new Uint16Array(G*G*G);
    let idx = 0;
    let parity = false;
    rle.forEach(count=>{
        const v = parity ? val16 : unval16; 
        for(let i=0; i<count; i++){
            grid[idx] = v;
            idx++;
        }
        parity = !parity;
    })
    return grid;
}


export default class QFFViewer extends HTMLElement{
    constructor(){
        super({antialias: false})
        this.should_render = true;
        // setup camera
        this.fov = 45;
        this.aspect = this.width / this.height;
        this.near = 0.01;
        this.far = 5;

        const src = this.getAttribute('src');

        // 
        const self = this;
        this.renderer = new THREE.WebGLRenderer( { antialias: false} );
        if(this.style.width == ''){
            this.style.width = `${this.width}px`;
        }
        if(this.style.height == ''){
            this.style.height = `${this.height}px`;
        }
        // this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setPixelRatio(1);
        const render_aspect = this.width / this.height;
        const render_max = Math.max(this.width, this.height);
        const screen_max = 800;
        let render_width = null;
        if(render_aspect > 1){
            render_width = Math.min(render_max, screen_max);
            render_height = render_width / render_aspect;
        } else {
            render_height = Math.min(render_max, screen_max);
            render_width = render_height * render_aspect;
        }
        this.renderer.setSize(render_width, render_height, false);
        this.renderer.domElement.style.width = `100%`;
        this.renderer.domElement.style.height = `100%`;
        this.appendChild(this.renderer.domElement);
        this.camera = new THREE.PerspectiveCamera(this.fov, this.aspect, this.near, this.far);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.addEventListener('change', function(event){ self.should_render = true; })
        this.controls.update();
        this.renderer.setClearColor(0x000000, 0);

        // setup scene
        this.scene = new THREE.Scene();
        function animate(){
            requestAnimationFrame(animate);
            self.controls.update()
            if(self.should_render){
                self.renderer.render(self.scene, self.camera);
                self.should_render = false;
            }
        }
        animate();

        this.loadPromise = fetch(src);
        this.loadPromise.then(async (response) => {
            const buf = await response.arrayBuffer();
            const qffMesh = await this.onBufferLoad(buf);
            this.scene.add(qffMesh)
            this.should_render = true;
        }).catch((error) => {
            console.error(error)
        });
    }


    load_pose(pose, up, aabb_scale) {
        const scale_pose_val = (v=>(v - 0.5) / aabb_scale + 0.5)
        const pose_mat = new THREE.Matrix4().set(
            pose[0][0],-pose[0][1],-pose[0][2], scale_pose_val(pose[0][3]),
            pose[1][0],-pose[1][1],-pose[1][2], scale_pose_val(pose[1][3]),
            pose[2][0],-pose[2][1],-pose[2][2], scale_pose_val(pose[2][3]),
            0, 0, 0, 1
        );
        const cam_pos = new THREE.Vector3();
        const cam_rot = new THREE.Quaternion();
        const cam_s = new THREE.Vector3();
        pose_mat.decompose(cam_pos, cam_rot, cam_s)
        let upv = new THREE.Vector3(up[0], up[1], up[2]);


        let front = new THREE.Vector3(0.5, 0.5, 0.5);

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
        this.camera.up.copy(upv);
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
        const data = await cbor.decodeFirst(buffer);
        const qff_buffer= new Uint16Array(loadCBORBuffer(data['qff_buffer']))
        const freqs = data['freqs'];
        const F = data['n_freqs'];
        // const G = 256;//data['grid_res'];
        const G = data['grid_res'];
        const C = data['n_feats'];
        const Q = data['n_quants'];
        const R = data['rank'];
        const qff_type = data['qff_type']
        const render_step = data['render_step'];
        const grid_th = -Math.log(1 - 0.01) / render_step;
        const up = data['up'];
        const initial_pose = data['poses'][0];

        // load MLP weights
        const density_channels = data['n_density_layers'];
        if(density_channels.length > 1){
          console.error('Only one density layer is supported');
          return;
        }
        const color_channels = data['n_color_layers'];
        const qff_raw_density_layer = new Float32Array(loadCBORBuffer(data[`qff_density_layer_0`]));
        const qff_raw_color_layers = Array.from({length: color_channels.length}, (v, i) => new Float32Array(loadCBORBuffer(data[`qff_color_layer_${i}`])));
        const qff_density_layer = Array.from({length: qff_raw_density_layer.length / 16}, (v, i) => qff_raw_density_layer.slice(i*16, (i+1)*16));
        const qff_color_layers = qff_raw_color_layers.map(qff_raw_color_layer=>Array.from({length: qff_raw_color_layer.length / 16}, (v, i) => qff_raw_color_layer.slice(i*16, (i+1)*16)));

        let qff3_buffer = null;
        switch(qff_type){
          case 1:
            const qff_1_chunk_size = F*2*Q*R*C;
            const qff_x = qff_buffer.slice(0*qff_1_chunk_size, 1*qff_1_chunk_size)
            const qff_y = qff_buffer.slice(1*qff_1_chunk_size, 2*qff_1_chunk_size)
            const qff_z = qff_buffer.slice(2*qff_1_chunk_size, 3*qff_1_chunk_size)

            // decompress to qff3
            qff3_buffer = qff1Toqff3(F, Q, R, [qff_x, qff_y, qff_z]);
          break;
          case 2:
            const qff_2_chunk_size = F*2*Q*Q*R*C;
            const qff_yz = qff_buffer.slice(0*qff_2_chunk_size, 1*qff_2_chunk_size)
            const qff_xz = qff_buffer.slice(1*qff_2_chunk_size, 2*qff_2_chunk_size)
            const qff_xy = qff_buffer.slice(2*qff_2_chunk_size, 3*qff_2_chunk_size)

            // decompress to qff3
            qff3_buffer = qff2Toqff3(F, Q, R, [qff_yz, qff_xz, qff_xy]);
            break;
          case 3:
            qff3_buffer = qff_buffer;
            break;

        }
        const qff3_buffers = Array.from({length: F*2}, (v, i) => qff3_buffer.slice(i*Q*Q*Q*4, (i+1)*Q*Q*Q*4));  
        // if(has_rle && false){
        const rles = data['grid_rles']
        const mips = rles.length;
        const aabb_scale = Math.pow(2, mips - 1);
        const grids = rles.map((rle, i)=>{
            return gridFromRLE(G, rle, grid_th + 1)
        });
        console.log(aabb_scale)
        this.load_pose(initial_pose, up, aabb_scale);

        // setup QFF mesh
        return new QFFMesh(F, Q, G, freqs, qff3_buffers, grids, qff_density_layer, qff_color_layers, grid_th, aabb_scale, 0.01, render_step);
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
