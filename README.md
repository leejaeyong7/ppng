# QFF Viewer

## Usage
```html
<body>
    <canvas id="qff-viewer-1" src="https://some_path_to_qff_binaries" 
            width="200" height="200" style="width: 200px; height: 200px;">
</body>
```

```javascript
import QFFViewer from 'qff-viewer';

// initialize QFF viewer on canvas selected with ID
const viewer = QFFViewer("qff-viewer-1", src="(optional) if canvas tag contains src");

// after usage (which will display just blank )
viewer.close();
```