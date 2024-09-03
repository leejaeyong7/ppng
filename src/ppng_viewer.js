import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {ppng1Toppng3} from './shaders/ppng1_to_ppng3.js';
import {ppng2Toppng3} from './shaders/ppng2_to_ppng3.js';
import PPNGMesh from './ppng_mesh.js';
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


export default class PPNGViewer extends HTMLElement{
    constructor(){
        super({antialias: false})
        this.should_render = true;
        // setup camera
        this.fov = 45;
        this.aspect = this.width / this.height;
        this.near = 0.01;
        this.far = 20;

        // 
        const self = this;
        this.renderer = new THREE.WebGLRenderer( { antialias: false} );

        // set DOM size (controlled with width / height)
        // set canvas size (controlled with render_width / render_height)
        if(this.style.width == ''){
            this.style.width = `${this.width}px`;
        }
        if(this.style.height == ''){
            this.style.height = `${this.height}px`;
        }
        this.renderer.setPixelRatio(1);
        const render_aspect = this.width / this.height;
        const render_max = Math.max(this.width, this.height);
        this.screen_max = 800;
        this.renderer.setSize(this.render_width, this.render_height, false);
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

        if(this.hasAttribute('src')){
          this.loadURL(this.src);
        }
    }

    async loadURL(url){
      this.loadPromise = fetch(url);
      this.loadPromise.then(async (response) => {
          const buf = await response.arrayBuffer();
          const ppngMesh = await this.onBufferLoad(buf);
          this.scene.add(ppngMesh)
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
        if(this.up){
          up = this.up;
        }
        let upv = new THREE.Vector3(up[0], up[1], up[2]);


        let front = new THREE.Vector3(0.5, 0.5, 0.5);

        // remove old control object
        if (this.controls){
            this.controls.dispose();
        }
        this.camera.up.copy(upv);
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
        const ppng_buffer= new Uint16Array(loadCBORBuffer(data['ppng_buffer']))
        const freqs = data['freqs'];
        const F = data['n_freqs'];
        // const G = 256;//data['grid_res'];
        const G = data['grid_res'];
        const C = data['n_feats'];
        const Q = data['n_quants'];
        const R = data['rank'];
        const ppng_type = data['ppng_type']
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
        const ppng_raw_density_layer = new Float32Array(loadCBORBuffer(data[`ppng_density_layer_0`]));
        const ppng_raw_color_layers = Array.from({length: color_channels.length}, (v, i) => new Float32Array(loadCBORBuffer(data[`ppng_color_layer_${i}`])));
        const ppng_density_layer = Array.from({length: ppng_raw_density_layer.length / 16}, (v, i) => ppng_raw_density_layer.slice(i*16, (i+1)*16));
        const ppng_color_layers = ppng_raw_color_layers.map(ppng_raw_color_layer=>Array.from({length: ppng_raw_color_layer.length / 16}, (v, i) => ppng_raw_color_layer.slice(i*16, (i+1)*16)));

        let ppng3_buffer = null;
        switch(ppng_type){
          case 1:
            const ppng_1_chunk_size = F*2*Q*R*C;
            const ppng_x = ppng_buffer.slice(0*ppng_1_chunk_size, 1*ppng_1_chunk_size)
            const ppng_y = ppng_buffer.slice(1*ppng_1_chunk_size, 2*ppng_1_chunk_size)
            const ppng_z = ppng_buffer.slice(2*ppng_1_chunk_size, 3*ppng_1_chunk_size)

            // decompress to ppng3
            ppng3_buffer = ppng1Toppng3(F, Q, R, [ppng_x, ppng_y, ppng_z]);
          break;
          case 2:
            const ppng_2_chunk_size = F*2*Q*Q*R*C;
            const ppng_yz = ppng_buffer.slice(0*ppng_2_chunk_size, 1*ppng_2_chunk_size)
            const ppng_xz = ppng_buffer.slice(1*ppng_2_chunk_size, 2*ppng_2_chunk_size)
            const ppng_xy = ppng_buffer.slice(2*ppng_2_chunk_size, 3*ppng_2_chunk_size)

            // decompress to ppng3
            ppng3_buffer = ppng2Toppng3(F, Q, R, [ppng_yz, ppng_xz, ppng_xy]);
            break;
          case 3:
            ppng3_buffer = ppng_buffer;
            break;

        }
        const ppng3_buffers = Array.from({length: F*2}, (v, i) => ppng3_buffer.slice(i*Q*Q*Q*4, (i+1)*Q*Q*Q*4));  
        // if(has_rle && false){
        const rles = data['grid_rles']
        const mips = rles.length;
        const aabb_scale = Math.pow(2, mips - 1);
        const grids = rles.map((rle, i)=>{
            return gridFromRLE(G, rle, grid_th + 1)
        });
        this.load_pose(initial_pose, up, aabb_scale);

        // setup PPNG mesh
        return new PPNGMesh(F, Q, G, freqs, ppng3_buffers, grids, ppng_density_layer, ppng_color_layers, grid_th, aabb_scale, 0.01, render_step);
    }

    get src(){
        return this.getAttribute('src') || '';
    }
    set src(val){
        this.setAttribute('src', val);
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
    set render_height(val){
        if(val){
            this.setAttribute('render_height', val);
        } else {
            this.removeAttribute('render_height')
        }
        if(this.renderer && this.camera){
            this.onResize();
        }
    }
    get render_height(){
        return this.getAttribute('render_height') || this.getAttribute('height') || 1;
    }
    set render_width(val){
        if(val){
            this.setAttribute('render_width', val);
        } else {
            this.removeAttribute('render_width')
        }
        if(this.renderer && this.camera){
            this.onResize();
        }
    }
    get render_width(){
        return this.getAttribute('render_width') || this.getAttribute('width') || 1;
    }

    get up(){
      const upstr = this.getAttribute('up');
      return upstr ? upstr.split(',').map(v=>parseFloat(v)) : null;
    }
    setAttribute(name, val){
        super.setAttribute(name, val);
        switch(name){
            case 'src': 
                this.loadURL(this.src);
                break;
            case 'width': 
                this.onResize();
                break;
            case 'height': 
                this.onResize();
                break;
            case 'render_width': 
                this.onResize();
                break;
            case 'render_height': 
                this.onResize();
                break;
            case 'up':
                this.setCameraUp();
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
        if(this.style.width == ''){
            this.style.width = `${this.width}px`;
        }
        if(this.style.height == ''){
            this.style.height = `${this.height}px`;
        }
        this.renderer.setSize(this.render_width, this.render_height, false);
        this.camera.fov = this.fov;
        this.camera.aspect = this.aspect; 
        this.camera.near = this.near;
        this.camera.far = this.far;
        this.camera.updateProjectionMatrix()
        this.flush();
    }
    setCameraUp(){
      const up = this.getAttribute('up');
      this.camera.up.set(up[0], up[1], up[2]);
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      const self = this;
      this.controls.addEventListener('change', function(event){ self.should_render = true; })
      this.flush();
    }
}
window.THREE = THREE;

customElements.define('ppng-viewer', PPNGViewer)
