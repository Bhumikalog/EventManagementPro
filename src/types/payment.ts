export interface Order {
  id: string
  user_id: string
  event_id: string
  ticket_type_id: string
  registration_id?: string
  razorpay_order_id?: string
  razorpay_payment_id?: string
  razorpay_signature?: string
  amount: number
  currency: string
  payment_status: 'pending' | 'completed' | 'failed' | 'refunded'
  qr_code_data?: string
  created_at: string
  updated_at: string
}

export interface RazorpayOrderResponse {
  order_id: string
  razorpay_order_id: string
  amount: number
  currency: string
  key_id: string
}

export interface RazorpayOptions {
  key: string
  amount: number
  currency: string
  name: string
  description: string
  order_id: string
  handler: (response: RazorpaySuccessResponse) => void
  prefill?: {
    name?: string
    email?: string
    contact?: string
  }
  theme?: {
    color?: string
  }
  modal?: {
    ondismiss?: () => void
  }
}

export interface RazorpaySuccessResponse {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => {
      open: () => void
      on: (event: string, handler: (response: any) => void) => void
    }
  }
}