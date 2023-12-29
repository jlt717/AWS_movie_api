const {
  S3Client,
  CopyObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const sharp = require("sharp");

exports.handler = async (event) => {
  const region = event.Records[0].awsRegion;
  const sourceBucket = event.Records[0].s3.bucket.name;
  const sourceKey = event.Records[0].s3.object.key;

  // Check if the object has the correct prefix.
  const prefixToProcess = "original-images/";
  if (!sourceKey.startsWith(prefixToProcess)) {
    // Object doesn't have the correct prefix, ignore.
    return {
      statusCode: 200,
      body: JSON.stringify("Object does not match processing criteria"),
    };
  }

  // Instantiate a new S3 client.
  const s3Client = new S3Client({
    region: region,
  });

  // Create an object with parameters for CopyObjectCommand.
  const copyObjectParams = {
    Bucket: process.env.DEST_BUCKET,
    Key: sourceKey,
    CopySource: `${sourceBucket}/${sourceKey}`,
  };

  try {
    await s3Client.send(new CopyObjectCommand(copyObjectParams));
    const getObjectParams = {
      Bucket: sourceBucket,
      Key: sourceKey,
    };
    const { Body: imageData } = await s3Client.send(new GetObjectCommand(getObjectParams));
    
    // Resize the image using sharp.
    const resizedImage = await sharp(Buffer.from(imageData))
      .resize({ width: 100, height: 100 })
      .toBuffer();

    // Upload the resized image back to the original S3 bucket with a new prefix.
    const uploadParams = {
      Bucket: sourceBucket,
      Key: `resized-images/${sourceKey.substring(prefixToProcess.length)}`,
      Body: resizedImage,
    };

    await s3Client.send(new PutObjectCommand(uploadParams));

    return {
      statusCode: 200,
      body: JSON.stringify("Image resized successfully"),
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify("Error resizing image"),
    };
  }
};
