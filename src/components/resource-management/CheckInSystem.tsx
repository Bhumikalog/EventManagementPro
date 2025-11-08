import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, CheckCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import jsQR from 'jsqr';

export function CheckInSystem() {
  const [uploading, setUploading] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    success: boolean;
    message: string;
    attendee?: any;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setVerificationResult(null);

    try {
      // Read the image file
      const imageData = await readImageFile(file);
      
      // Decode QR code
      const qrData = decodeQR(imageData);
      
      if (!qrData) {
        setVerificationResult({
          success: false,
          message: 'No QR code found in the image. Please upload a valid QR code.'
        });
        setUploading(false);
        return;
      }

      // Verify and check-in
      await verifyAndCheckIn(qrData);
      
    } catch (error: any) {
      console.error('Error processing QR code:', error);
      toast.error('Failed to process QR code');
      setVerificationResult({
        success: false,
        message: error.message || 'Failed to process QR code'
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const readImageFile = (file: File): Promise<ImageData> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          resolve(imageData);
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  const decodeQR = (imageData: ImageData): string | null => {
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    return code?.data || null;
  };

  const verifyAndCheckIn = async (qrData: string) => {
    try {
      // QR data should be the registration ID or order ID
      // First, try to find the registration by ID
      const { data: registration, error: regError } = await supabase
        .from('registrations')
        .select(`
          *,
          user:user_id(display_name, email),
          event:events(title),
          ticket_type:ticket_types(name)
        `)
        .eq('id', qrData)
        .single();

      if (regError || !registration) {
        // If not found by registration ID, try to find by order QR code data
        const { data: order, error: orderError } = await supabase
          .from('orders')
          .select(`
            *,
            registration:registrations(
              *,
              user:user_id(display_name, email),
              event:events(title),
              ticket_type:ticket_types(name)
            )
          `)
          .eq('qr_code_data', qrData)
          .single();

        if (orderError || !order?.registration) {
          setVerificationResult({
            success: false,
            message: 'Invalid or unregistered QR code.'
          });
          toast.error('Invalid QR code');
          return;
        }

        // Use the registration from the order
        await checkInRegistration(order.registration);
        return;
      }

      // Check in using the found registration
      await checkInRegistration(registration);
      
    } catch (error: any) {
      console.error('Error verifying QR code:', error);
      setVerificationResult({
        success: false,
        message: 'Error verifying QR code: ' + error.message
      });
      toast.error('Failed to verify QR code');
    }
  };

  const checkInRegistration = async (registration: any) => {
    if (registration.checked_in_at) {
      setVerificationResult({
        success: false,
        message: `This attendee has already been checked in at ${new Date(registration.checked_in_at).toLocaleString()}.`,
        attendee: registration
      });
      toast.warning('Already checked in');
      return;
    }

    // Update check-in status
    const { error: updateError } = await supabase
      .from('registrations')
      .update({ checked_in_at: new Date().toISOString() })
      .eq('id', registration.id);

    if (updateError) {
      throw new Error('Failed to update check-in status');
    }

    // Also insert into checkins table to record resource/event check-in
    try {
      // Find resource allocation for the event
      const { data: allocation } = await supabase
        .from('resource_allocations')
        .select('resource_id')
        .eq('event_id', registration.event_id)
        .single();

      const resourceId = allocation?.resource_id || null;

      // Prevent duplicate checkins for the same registration
      const { data: existing } = await supabase
        .from('checkins')
        .select('*')
        .eq('registration_id', registration.id)
        .limit(1);

      if (existing && existing.length > 0) {
        console.warn('Checkin already exists for registration', registration.id);
      } else {
        const { error: checkinError } = await supabase
          .from('checkins')
          .insert({
            registration_id: registration.id,
            participant_id: registration.user_id,
            resource_id: resourceId,
            event_id: registration.event_id,
            status: 'checked_in'
          });

        if (checkinError) {
          console.warn('Failed to insert checkin record:', checkinError);
        }
      }

    } catch (err) {
      console.error('Error recording checkin:', err);
    }

    setVerificationResult({
      success: true,
      message: 'Check-in successful!',
      attendee: registration
    });
    toast.success('Attendee checked in successfully!');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>QR Code Check-In System</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Upload a QR code image to verify and check-in attendees.
          </p>
          
          <div className="flex flex-col items-center gap-4 p-8 border-2 border-dashed rounded-lg">
            <Upload className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <p className="font-medium mb-2">Upload QR Code Image</p>
              <p className="text-sm text-muted-foreground mb-4">
                Supports JPG, PNG, and other image formats
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
                id="qr-upload"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Processing...' : 'Select QR Code Image'}
              </Button>
            </div>
          </div>

          {verificationResult && (
            <Alert variant={verificationResult.success ? 'default' : 'destructive'}>
              {verificationResult.success ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">{verificationResult.message}</p>
                  {verificationResult.attendee && (
                    <div className="text-sm space-y-1">
                      <p><strong>Name:</strong> {verificationResult.attendee.user?.display_name}</p>
                      <p><strong>Email:</strong> {verificationResult.attendee.user?.email}</p>
                      <p><strong>Event:</strong> {verificationResult.attendee.event?.title}</p>
                      <p><strong>Ticket:</strong> {verificationResult.attendee.ticket_type?.name}</p>
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
