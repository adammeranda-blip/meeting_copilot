/** @type {import('next').NextConfig} */
const nextConfig = {
  api: {
    bodyParser: false // we handle multipart ourselves
  }
};
export default nextConfig;
