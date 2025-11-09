import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, CheckCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import jsQR from 'jsqr';

export function CheckInSystem() {
  const [uploading, setUploading] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    success: boolean;
    message: string;
    attendee?: any;
  } | null>(null);
  // useToast provides a toast(fn) helper; map to a local name to avoid confusion with other toast APIs
  const { toast: showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // For now we no longer support live camera scanning in this UI (requested)
  const db = supabase as any;

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
      showToast({ title: 'Error', description: 'Failed to process QR code', variant: 'destructive' });
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

  // live camera scanning removed per request

  const decodeQR = (imageData: ImageData): string | null => {
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    return code?.data || null;
  };

  const verifyAndCheckIn = async (qrData: string) => {
    try {
      // QR payload might be JSON with { event_id, participant_id } or a registration id string.
      let eventId: string | null = null;
      let participantId: string | null = null;
      let registrationObj: any = null;

  try {
        const parsed = JSON.parse(qrData);
        if (parsed?.event_id && parsed?.participant_id) {
          eventId = parsed.event_id;
          participantId = parsed.participant_id;
        }
        // some payloads might contain registration_id
        if (!participantId && parsed?.registration_id) {
          // fall through to lookup registration
          registrationObj = { id: parsed.registration_id };
        }
      } catch (e) {
        // not JSON — treat as registration id
        registrationObj = { id: qrData };
      }

      if (registrationObj && !participantId) {
        // lookup registration to extract event_id and participant (user_id)
        const { data: registration, error: regError } = await db
          .from('registrations')
          .select('*')
          .eq('id', registrationObj.id)
          .single();

        if (regError || !registration) {
          // try orders table with qr_code_data
          const { data: order } = await (supabase as any)
            .from('orders')
            .select('registration_id')
            .eq('qr_code_data', qrData)
            .limit(1)
            .maybeSingle();

          if (order?.registration_id) {
            const { data: reg2, error: reg2Err } = await db
                .from('registrations')
                .select('*')
                .eq('id', order.registration_id)
                .single();
              if (reg2Err || !reg2) {
                setVerificationResult({ success: false, message: 'Invalid or unregistered QR code.' });
                showToast({ title: 'Error', description: 'Invalid QR code', variant: 'destructive' });
                return;
              }
            registrationObj = reg2;
            eventId = reg2.event_id;
            participantId = reg2.user_id;
          } else {
            setVerificationResult({ success: false, message: 'Invalid or unregistered QR code.' });
            showToast({ title: 'Error', description: 'Invalid QR code', variant: 'destructive' });
            return;
          }
        } else {
          registrationObj = registration;
          eventId = registration.event_id;
          participantId = registration.user_id;
        }
      }

      if (!eventId || !participantId) {
        setVerificationResult({ success: false, message: 'QR code did not contain required event or participant information.' });
        showToast({ title: 'Error', description: 'QR code missing event or participant id', variant: 'destructive' });
        return;
      }

      // check if already checked in
      const { data: existing } = await db
        .from('checkins')
        .select('*')
        .eq('participant_id', participantId)
        .eq('event_id', eventId)
        .eq('status', 'checked_in')
        .limit(1);

      if (existing && existing.length > 0) {
        setVerificationResult({ success: false, message: 'Participant already checked in for this event.' });
        showToast({ title: 'Warning', description: 'Participant already checked in for this event.' });
        return;
      }

      // find linked resource allocation for the event (if any)
      const { data: allocation } = await db
        .from('resource_allocations')
        .select('resource_id')
        .eq('event_id', eventId)
        .limit(1)
        .maybeSingle();

      const resourceId = allocation?.resource_id ?? null;

      // insert checkin
      const { error: checkinErr } = await (supabase as any)
        .from('checkins')
        .insert({
          participant_id: participantId,
          event_id: eventId,
          resource_id: resourceId,
          status: 'checked_in'
        });

      if (checkinErr) {
        console.error('Failed to insert checkin:', checkinErr);
        setVerificationResult({ success: false, message: 'Failed to record check-in' });
        showToast({ title: 'Error', description: 'Failed to record check-in', variant: 'destructive' });
        return;
      }

      // update registrations.checked_in_at when registration exists
      if (registrationObj?.id) {
        await db
          .from('registrations')
          .update({ checked_in_at: new Date().toISOString() })
          .eq('id', registrationObj.id);
      }

      // update resource status to allocated (if resource exists)
      if (resourceId) {
        await db
          .from('resources')
          .update({ status: 'allocated', allocated_to: eventId })
          .eq('id', resourceId);
      }

      // fetch participant info for success message
      const { data: participant } = await db
        .from('profiles')
        .select('display_name, email')
        .eq('id', participantId)
        .maybeSingle();

        setVerificationResult({ success: true, message: `Successful Check-In for ${participant?.display_name || 'participant'}.`, attendee: participant });
      showToast({ title: 'Success', description: `Successful Check-In for ${participant?.display_name || 'participant'}.` });
    } catch (error: any) {
      console.error('Error verifying QR code:', error);
      setVerificationResult({ success: false, message: 'Error verifying QR code: ' + (error?.message || error) });
      showToast({ title: 'Error', description: 'Failed to verify QR code', variant: 'destructive' });
    }
  };

  const checkInRegistration = async (registration: any) => {
    if (registration.checked_in_at) {
      setVerificationResult({
        success: false,
        message: `This attendee has already been checked in at ${new Date(registration.checked_in_at).toLocaleString()}.`,
        attendee: registration
      });
      showToast({ title: 'Warning', description: 'Already checked in' });
      return;
    }

    // Update check-in status
    const { error: updateError } = await (supabase as any)
      .from('registrations')
      .update({ checked_in_at: new Date().toISOString() })
      .eq('id', registration.id);

    if (updateError) {
      throw new Error('Failed to update check-in status');
    }

    // Also insert into checkins table to record resource/event check-in
    try {
      // Find resource allocation for the event
      const { data: allocation } = await (supabase as any)
        .from('resource_allocations')
        .select('resource_id')
        .eq('event_id', registration.event_id)
        .single();

      const resourceId = allocation?.resource_id || null;

      // Prevent duplicate checkins for the same registration
      const { data: existing } = await (supabase as any)
        .from('checkins')
        .select('*')
        .eq('registration_id', registration.id)
        .limit(1);

      if (existing && existing.length > 0) {
        console.warn('Checkin already exists for registration', registration.id);
      } else {
        const { error: checkinError } = await (supabase as any)
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
    showToast({ title: 'Success', description: 'Attendee checked in successfully!' });
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
              <div className="mt-4">
                    {/* Live camera scanning removed as requested */}
              </div>
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
