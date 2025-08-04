import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  TextField,
  Typography,
  Switch,
  FormControlLabel,
  Alert,
  IconButton,
  Tabs,
  Tab,
  Card,
  CardContent,
  CircularProgress
} from '@mui/material';
import {
  QrCodeScanner,
  CameraAlt,
  Keyboard,
  Close,
  FlashOn,
  FlashOff,
  CameraRear,
  CameraFront
} from '@mui/icons-material';
import Quagga from 'quagga';

interface BarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
  <div hidden={value !== index} style={{ width: '100%' }}>
    {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
  </div>
);

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ open, onClose, onScan }) => {
  const [tabValue, setTabValue] = useState(0);
  const [manualBarcode, setManualBarcode] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasCamera, setHasCamera] = useState(false);
  const [torch, setTorch] = useState(false);
  const [currentCamera, setCurrentCamera] = useState<'front' | 'back'>('back');
  const [recentScans, setRecentScans] = useState<string[]>([]);
  
  const scannerRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Check camera availability
  useEffect(() => {
    const checkCamera = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setHasCamera(videoDevices.length > 0);
      } catch (err) {
        setHasCamera(false);
      }
    };

    if (open) {
      checkCamera();
      loadRecentScans();
    }
  }, [open]);

  // Load recent scans from localStorage
  const loadRecentScans = () => {
    try {
      const saved = localStorage.getItem('recentBarcodeScans');
      if (saved) {
        setRecentScans(JSON.parse(saved));
      }
    } catch (err) {
      console.warn('Failed to load recent scans');
    }
  };

  // Save recent scan
  const saveRecentScan = (barcode: string) => {
    try {
      const updated = [barcode, ...recentScans.filter(b => b !== barcode)].slice(0, 10);
      setRecentScans(updated);
      localStorage.setItem('recentBarcodeScans', JSON.stringify(updated));
    } catch (err) {
      console.warn('Failed to save recent scan');
    }
  };

  // Initialize camera scanner
  const initScanner = async () => {
    if (!scannerRef.current || !hasCamera) return;

    setIsScanning(true);
    setError(null);

    try {
      // Stop any existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const constraints = {
        video: {
          facingMode: currentCamera === 'back' ? 'environment' : 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Initialize Quagga
      Quagga.init({
        inputStream: {
          name: 'Live',
          type: 'LiveStream',
          target: scannerRef.current,
          constraints
        },
        decoder: {
          readers: [
            'code_128_reader',
            'ean_reader',
            'ean_8_reader',
            'code_39_reader',
            'code_39_vin_reader',
            'codabar_reader',
            'upc_reader',
            'upc_e_reader',
            'i2of5_reader'
          ]
        },
        locator: {
          patchSize: 'medium',
          halfSample: true
        },
        numOfWorkers: 2,
        frequency: 10,
        locate: true
      }, (err) => {
        if (err) {
          setError('Camera initialization failed');
          setIsScanning(false);
          return;
        }
        Quagga.start();
      });

      // Handle barcode detection
      Quagga.onDetected((result) => {
        const barcode = result.codeResult.code;
        if (barcode && barcode.length > 3) {
          handleScan(barcode);
        }
      });

    } catch (err: any) {
      setError(err.message || 'Camera access denied');
      setIsScanning(false);
    }
  };

  // Stop scanner
  const stopScanner = () => {
    if (isScanning) {
      Quagga.stop();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      setIsScanning(false);
    }
  };

  // Handle successful scan
  const handleScan = (barcode: string) => {
    saveRecentScan(barcode);
    onScan(barcode);
    stopScanner();
    onClose();
  };

  // Handle manual barcode input
  const handleManualSubmit = () => {
    if (manualBarcode.trim()) {
      handleScan(manualBarcode.trim());
      setManualBarcode('');
    }
  };

  // Toggle flashlight (if supported)
  const toggleTorch = async () => {
    try {
      if (streamRef.current) {
        const track = streamRef.current.getVideoTracks()[0];
        const capabilities = track.getCapabilities();
        
        if (capabilities.torch) {
          await track.applyConstraints({
            advanced: [{ torch: !torch }]
          });
          setTorch(!torch);
        }
      }
    } catch (err) {
      console.warn('Torch not supported');
    }
  };

  // Switch camera
  const switchCamera = () => {
    setCurrentCamera(prev => prev === 'back' ? 'front' : 'back');
    if (isScanning) {
      stopScanner();
      setTimeout(initScanner, 100);
    }
  };

  // Handle dialog close
  const handleClose = () => {
    stopScanner();
    setError(null);
    setManualBarcode('');
    onClose();
  };

  // Handle tab change
  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    if (newValue === 0 && hasCamera) {
      setTimeout(initScanner, 100);
    } else {
      stopScanner();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          minHeight: 500
        }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <QrCodeScanner color="primary" />
            <Typography variant="h6">Barcode Scanner</Typography>
          </Box>
          <IconButton onClick={handleClose} size="small">
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab
            icon={<CameraAlt />}
            label="Camera Scan"
            disabled={!hasCamera}
          />
          <Tab
            icon={<Keyboard />}
            label="Manual Entry"
          />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          {hasCamera ? (
            <Box>
              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}
              
              <Card sx={{ mb: 2 }}>
                <CardContent sx={{ position: 'relative' }}>
                  <Box
                    ref={scannerRef}
                    sx={{
                      width: '100%',
                      height: 300,
                      bgcolor: 'black',
                      borderRadius: 1,
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                  >
                    {!isScanning && (
                      <Box
                        sx={{
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                          textAlign: 'center',
                          color: 'white'
                        }}
                      >
                        <CameraAlt sx={{ fontSize: 64, mb: 1 }} />
                        <Typography>Click "Start Scanning" to begin</Typography>
                      </Box>
                    )}
                  </Box>

                  {/* Scanner overlay */}
                  {isScanning && (
                    <Box
                      sx={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: 250,
                        height: 100,
                        border: '2px solid #4caf50',
                        borderRadius: 1,
                        pointerEvents: 'none'
                      }}
                    />
                  )}

                  {/* Camera controls */}
                  {isScanning && (
                    <Box
                      sx={{
                        position: 'absolute',
                        bottom: 16,
                        right: 16,
                        display: 'flex',
                        gap: 1
                      }}
                    >
                      <IconButton
                        onClick={toggleTorch}
                        sx={{ bgcolor: 'rgba(0,0,0,0.5)', color: 'white' }}
                        size="small"
                      >
                        {torch ? <FlashOff /> : <FlashOn />}
                      </IconButton>
                      <IconButton
                        onClick={switchCamera}
                        sx={{ bgcolor: 'rgba(0,0,0,0.5)', color: 'white' }}
                        size="small"
                      >
                        {currentCamera === 'back' ? <CameraFront /> : <CameraRear />}
                      </IconButton>
                    </Box>
                  )}
                </CardContent>
              </Card>

              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                {!isScanning ? (
                  <Button
                    variant="contained"
                    onClick={initScanner}
                    startIcon={<CameraAlt />}
                    size="large"
                  >
                    Start Scanning
                  </Button>
                ) : (
                  <Button
                    variant="outlined"
                    onClick={stopScanner}
                    startIcon={<Close />}
                    size="large"
                  >
                    Stop Scanning
                  </Button>
                )}
              </Box>
            </Box>
          ) : (
            <Alert severity="warning">
              Camera not available. Please use manual entry.
            </Alert>
          )}
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <TextField
              fullWidth
              label="Enter Barcode"
              value={manualBarcode}
              onChange={(e) => setManualBarcode(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleManualSubmit();
                }
              }}
              placeholder="Scan or type barcode..."
              autoFocus
              InputProps={{
                endAdornment: (
                  <Button
                    onClick={handleManualSubmit}
                    disabled={!manualBarcode.trim()}
                  >
                    Submit
                  </Button>
                )
              }}
            />

            {recentScans.length > 0 && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Recent Scans
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {recentScans.map((barcode, index) => (
                    <Card
                      key={index}
                      sx={{
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'action.hover' }
                      }}
                      onClick={() => handleScan(barcode)}
                    >
                      <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                        <Typography variant="body2" fontFamily="monospace">
                          {barcode}
                        </Typography>
                      </CardContent>
                    </Card>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </TabPanel>
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={handleClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BarcodeScanner;