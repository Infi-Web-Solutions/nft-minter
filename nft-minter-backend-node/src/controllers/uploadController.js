import { uploadToIPFS, testPinataConnection } from "../utils/ipfsUtils.js";

export const uploadFileToIPFS = async (req, res) => {
  try {
    console.log("[UPLOAD] New upload request");

    if (!req.files || !req.files.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded. Use field name "file"',
      });
    }

    const file = req.files.file;
    console.log("[UPLOAD] File details:", {
      name: file.name,
      size: file.size,
      mimetype: file.mimetype,
    });

    if (!file.data || file.data.length === 0) {
      return res.status(400).json({
        success: false,
        error: "File data is empty or corrupted",
      });
    }

    if (file.size > 100 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        error: "File too large (max 100MB)",
      });
    }

    // Test connection first
    console.log("[UPLOAD] Testing Pinata connection...");
    const connectionTest = await testPinataConnection();
    if (!connectionTest.success) {
      console.log("[UPLOAD] ERROR: Pinata connection failed:", connectionTest);
      return res.status(500).json({
        success: false,
        error: `Pinata connection failed: ${connectionTest.error}`,
        details: connectionTest,
      });
    }
    console.log("[UPLOAD] Pinata connection successful via", connectionTest.method);

    // Upload
    console.log("[UPLOAD] Uploading to IPFS...");
    const ipfsHash = await uploadToIPFS(file.data, file.name);

    const gateways = {
      pinata: `https://gateway.pinata.cloud/ipfs/${ipfsHash}`,
      ipfs: `https://ipfs.io/ipfs/${ipfsHash}`,
      cloudflare: `https://cloudflare-ipfs.com/ipfs/${ipfsHash}`,
    };

    return res.status(200).json({
      success: true,
      data: { ipfsHash, url: gateways.pinata, gateways },
    });
  } catch (error) {
    console.error("[UPLOAD] Upload failed:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Unknown IPFS upload error",
    });
  }
};

// Manual test endpoint
export const testIPFS = async (req, res) => {
  try {
    const envCheck = {
      PINATA_JWT: !!process.env.PINATA_JWT,
      PINATA_API_KEY: !!process.env.PINATA_API_KEY,
      PINATA_SECRET: !!process.env.PINATA_SECRET,
    };

    const connectionTest = await testPinataConnection();

    res.status(200).json({
      success: true,
      message: "IPFS connection test completed",
      data: { environment: envCheck, connection: connectionTest },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
