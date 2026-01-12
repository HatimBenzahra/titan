const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = 3003;
const WORKSPACE = '/work';

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Sensitive file patterns to block
const FILE_BLOCKLIST = [
  /^\.\./,  // Parent directory access
  /\/\.\./,  // Parent directory in path
  /^\/etc\//,
  /^\/root\//,
  /^\/home\/.*\/\.ssh\//,
  /\.env$/,
  /\.pem$/,
  /\.key$/,
  /id_rsa$/,
  /\.aws\/credentials$/,
];

// Validate and resolve file path
function validatePath(filePath) {
  // Normalize the path
  const normalized = path.normalize(filePath);

  // Resolve to absolute path
  const absolute = path.isAbsolute(normalized)
    ? normalized
    : path.join(WORKSPACE, normalized);

  // Check if path is within workspace
  const relative = path.relative(WORKSPACE, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Access denied: Path is outside workspace');
  }

  // Check against blocklist
  if (FILE_BLOCKLIST.some(pattern => pattern.test(absolute))) {
    throw new Error('Access denied: File is in blocklist');
  }

  return absolute;
}

// Read file
app.get('/read', async (req, res) => {
  try {
    const { path: filePath } = req.query;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'File path is required'
      });
    }

    const absolutePath = validatePath(filePath);
    console.log(`[FILE READ] ${absolutePath}`);

    // Check if file exists
    const stats = await fs.stat(absolutePath);

    if (!stats.isFile()) {
      return res.status(400).json({
        success: false,
        error: 'Path is not a file'
      });
    }

    // Check file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (stats.size > maxSize) {
      return res.status(400).json({
        success: false,
        error: `File too large (max ${maxSize} bytes)`
      });
    }

    const content = await fs.readFile(absolutePath, 'utf8');

    res.json({
      success: true,
      content,
      size: stats.size,
      path: absolutePath
    });

  } catch (error) {
    console.error(`[FILE READ] Error: ${error.message}`);

    if (error.code === 'ENOENT') {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Write file
app.post('/write', async (req, res) => {
  try {
    const { path: filePath, content } = req.body;

    if (!filePath || content === undefined) {
      return res.status(400).json({
        success: false,
        error: 'File path and content are required'
      });
    }

    if (typeof content !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Content must be a string'
      });
    }

    const absolutePath = validatePath(filePath);
    console.log(`[FILE WRITE] ${absolutePath}`);

    // Check content size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (Buffer.byteLength(content, 'utf8') > maxSize) {
      return res.status(400).json({
        success: false,
        error: `Content too large (max ${maxSize} bytes)`
      });
    }

    // Ensure directory exists
    const directory = path.dirname(absolutePath);
    await fs.mkdir(directory, { recursive: true });

    // Write file
    await fs.writeFile(absolutePath, content, 'utf8');

    const stats = await fs.stat(absolutePath);

    res.json({
      success: true,
      path: absolutePath,
      size: stats.size
    });

  } catch (error) {
    console.error(`[FILE WRITE] Error: ${error.message}`);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// List directory
app.get('/list', async (req, res) => {
  try {
    const { path: dirPath = '.' } = req.query;

    const absolutePath = validatePath(dirPath);
    console.log(`[FILE LIST] ${absolutePath}`);

    // Check if directory exists
    const stats = await fs.stat(absolutePath);

    if (!stats.isDirectory()) {
      return res.status(400).json({
        success: false,
        error: 'Path is not a directory'
      });
    }

    // Read directory
    const entries = await fs.readdir(absolutePath, { withFileTypes: true });

    // Get stats for each entry
    const files = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(absolutePath, entry.name);
        const entryStats = await fs.stat(entryPath);

        return {
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: entryStats.size,
          modified: entryStats.mtime
        };
      })
    );

    res.json({
      success: true,
      path: absolutePath,
      files
    });

  } catch (error) {
    console.error(`[FILE LIST] Error: ${error.message}`);

    if (error.code === 'ENOENT') {
      return res.status(404).json({
        success: false,
        error: 'Directory not found'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete file
app.delete('/delete', async (req, res) => {
  try {
    const { path: filePath } = req.body;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'File path is required'
      });
    }

    const absolutePath = validatePath(filePath);
    console.log(`[FILE DELETE] ${absolutePath}`);

    // Check if exists
    await fs.access(absolutePath);

    // Delete file
    await fs.unlink(absolutePath);

    res.json({
      success: true,
      path: absolutePath
    });

  } catch (error) {
    console.error(`[FILE DELETE] Error: ${error.message}`);

    if (error.code === 'ENOENT') {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'file-server', workspace: WORKSPACE });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`📁 File server listening on port ${PORT}`);
  console.log(`   Workspace: ${WORKSPACE}`);
  console.log(`   Health check: http://0.0.0.0:${PORT}/health`);
  console.log(`   Read: GET http://0.0.0.0:${PORT}/read?path=<file>`);
  console.log(`   Write: POST http://0.0.0.0:${PORT}/write`);
  console.log(`   List: GET http://0.0.0.0:${PORT}/list?path=<dir>`);
  console.log(`   Delete: DELETE http://0.0.0.0:${PORT}/delete`);
});
