import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as cbor from 'cbor-web';

export default class QFFViewer extends HTMLElement{
    constructor(){
        super({antialias: false})
        this.width = this.getAttribute('width')
        this.height = this.getAttribute('height')
        if (this.width === null){
            this.width = 1;
        }
        if (this.height === null){
            this.height = 1;
        }
        this.should_render = true;
        // setup camera
        this.fov = 45;
        this.aspect = 4.0 / 4.0;
        this.near = 0.01;
        this.far = 5;
        const src = this.getAttribute('src');
        this.loadPromise = fetch(src);
        this.loadPromise.then(async (response) => {
            const buf = await response.arrayBuffer();
            console.log(cbor)
            cbor.decodeFirst(buf).then((data) => {
                console.log(data)
            });
        }).catch((error) => {
            console.error(error)
        });

        // 
        const self = this;
        this.renderer = new THREE.WebGLRenderer( { antialias: false} );
        this.renderer.setPixelRatio(1);
        this.renderer.setSize(this.width, this.height, false);
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
    }

    on
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
        self.should_render = true;
    }

    onFileLoad(){
        if(this.scene.children.length > 0){
            this.scene.remove(this.scene.children[0]);
        }
        this.scene.add(mesh);
    }

    onResize(){
        // console.log('resized!')
        // this.renderer.setSize(this.width, this.height, false);
        // this.camera.fov = this.fov;
        // this.camera.aspect = this.aspect; 
        // this.camera.near = this.near;
        // this.camera.far = this.far;
        // this.camera.updateProjectionMatrix()
        // this.flush();
    }
}

customElements.define('qff-viewer', QFFViewer)
