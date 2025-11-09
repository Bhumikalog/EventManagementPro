export const corsHeaders = {
  // For local development use the exact origin. Change to your production origin when deployed.
  'Access-Control-Allow-Origin': 'http://localhost:8080',
  // Explicitly allow common headers the client will send. Header names are case-insensitive.
  'Access-Control-Allow-Headers': 'Authorization, X-Requested-With, Content-Type, apikey, x-client-info',
  // Allow the HTTP methods your client will use
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
  // If your frontend sends credentials (cookies, auth), set this to true and ensure origin is not '*'
  'Access-Control-Allow-Credentials': 'true',
  // Cache preflight responses for 10 minutes
  'Access-Control-Max-Age': '600'
}
