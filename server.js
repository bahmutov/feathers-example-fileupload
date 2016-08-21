// --- server.js ---
const feathers = require('feathers');
const serveStatic = require('feathers').static;
const rest = require('feathers-rest');
const socketio = require('feathers-socketio');
const hooks = require('feathers-hooks');
const bodyParser = require('body-parser');
const handler = require('feathers-errors/handler');
const multer = require('multer');
const multipartMiddleware = multer();
const dauria = require('dauria');
const filesize = require('file-size');
const mkdir = require('mkdir-p')
const glob = require('glob')

// feathers-blob service
const blobService = require('feathers-blob');

// Here we initialize a FileSystem storage,
// but you can use feathers-blob with any other
// storage service like AWS or Google Drive.
const fs = require('fs-blob-store');
const path = require('path')
const join = path.join
const rootFolder = process.env.NOW ? '/tmp' : __dirname
const topFolder = join(rootFolder, 'uploads')
const blobStorage = fs(topFolder);

const exists = require('fs').existsSync;

// Feathers app
const app = feathers();

// Serve our index page
app.use('/', serveStatic(__dirname))
// Parse HTTP JSON bodies
app.use(bodyParser.json());

app.post('/new-folder', function (req, res) {
    console.log('new folder folderId', req.body.folderId)
    if (!req.body.folderId) {
        throw new Error('Missing folder id');
    }
    const fullFolder = join(topFolder, req.body.folderId)
    if (!exists(fullFolder)) {
        mkdir.sync(fullFolder);
        console.log('made folder', fullFolder);
    }

    return res.sendStatus(200)
})

app.post('/uploaded', function (req, res) {
    console.log('list of uploaded files in folder %s', req.body.folderId)
    if (!req.body.folderId) {
        throw new Error('Missing folder id');
    }
    const fullFolder = join(topFolder, req.body.folderId)
    if (!exists(fullFolder)) {
        throw new Error('Folder ' + req.body.folderId + ' not found')
    }
    console.log('files in folder', fullFolder)
    glob(`${fullFolder}/*`, function (err, files) {
        if (err) {
            throw new Error(err)
        }
        const relative = files.map(name => path.relative(topFolder, name))
        console.log('found %d files', relative.length)
        console.log(relative)
        res.send(relative)
    }, {dir: fullFolder})
    // return res.sendStatus(200)
})

// Parse URL-encoded params
app.use(bodyParser.urlencoded({ extended: true }));
// Register hooks module
app.configure(hooks());
// Add REST API support
app.configure(rest());
// Configure Socket.io real-time APIs
// app.configure(socketio());


// Upload Service with multipart support
app.use('/uploads',

    // multer parses the file named 'uri'.
    // Without extra params the data is
    // temporarely kept in memory
    multipartMiddleware.single('uri'),

    // another middleware, this time to
    // transfer the received file to feathers
    function(req,res,next){
        console.log('/uploads', req.body);
        const folderId = req.body.folderId;
        if (!folderId) {
            throw new Error('missing folderId');
        }
        req.feathers.file = req.file;
        req.feathers.folderId = req.body.folderId;
        next();
    },
    blobService({Model: blobStorage})
);

// before-create Hook to get the file (if there is any)
// and turn it into a datauri,
// transparently getting feathers-blob
// to work with multipart file uploads
app.service('/uploads').before({
    create: [
        function(hook) {
            if (!hook.params.folderId) {
                throw new Error('Missing folderId');
            }
            if (!hook.data.uri && hook.params.file){
                const file = hook.params.file;
                console.log('decoding file', file.originalname,
                    filesize(file.size).human());
                console.log('params folder id', hook.params.folderId);

                const uri = dauria.getBase64DataURI(file.buffer, file.mimetype);
                hook.data = {uri: uri};
                console.log('output filename with folder')
                hook.data.id = join(hook.params.folderId, file.originalname);
                console.log(hook.data.id)
            }
        }
    ]
}).after({
    create: [
        function (hook) {
            // return to client only folder + filename
            // const id = join(hook.params.folderId, hook.params.file.originalname)
            console.log(`after uploading file ${hook.result.id}`)
            // hook.result.id = id
            delete hook.result.uri
        }
    ]
});

// Register a nicer error handler than the default Express one
app.use(handler());

// Start the server
app.listen(3030, function(){
    console.log('Feathers app started at localhost:3030')
});
