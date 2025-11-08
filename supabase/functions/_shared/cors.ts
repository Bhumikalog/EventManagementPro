export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  // allow credentials only if you need them; for now keep broad but safe
  'Access-Control-Allow-Credentials': 'true'
}
