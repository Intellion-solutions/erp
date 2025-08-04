import React, { useState, useRef } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  IconButton,
  Chip,
  Avatar,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  ListItemSecondaryAction,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
  Pagination,
  Alert,
  Skeleton,
  Menu,
  MenuItem as MenuItemComponent,
  Tooltip,
  LinearProgress,
  Paper,
  Divider
} from '@mui/material';
import {
  Add,
  Search,
  FilterList,
  Download,
  Delete,
  Visibility,
  MoreVert,
  Upload,
  Refresh,
  Folder,
  Image,
  Description,
  Movie,
  MusicNote,
  Archive,
  CloudUpload,
  GetApp,
  DeleteForever,
  Info,
  Edit
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';

// API service
import { fileApi } from '../../services/api';

// Types
interface FileUpload {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  uploadedBy: string;
  createdAt: string;
  uploadedByUser?: {
    firstName: string;
    lastName: string;
    email: string;
  };
}

interface FileStats {
  totalFiles: number;
  totalSize: number;
  fileTypes: Array<{
    mimeType: string;
    _count: { mimeType: number };
    _sum: { size: number };
  }>;
  recentUploads: FileUpload[];
}

const FileManager: React.FC = () => {
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedFile, setSelectedFile] = useState<FileUpload | null>(null);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedFileForMenu, setSelectedFileForMenu] = useState<FileUpload | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Fetch files
  const { data: filesData, isLoading, error } = useQuery(
    ['files', page, limit, search, type, sortBy, sortOrder],
    () => fileApi.getFiles({
      page,
      limit,
      search,
      type,
      sortBy,
      sortOrder
    }),
    {
      keepPreviousData: true,
    }
  );

  // Fetch file statistics
  const { data: statsData } = useQuery(
    ['file-stats'],
    () => fileApi.getFileStats(),
    {
      refetchInterval: 300000, // Refresh every 5 minutes
    }
  );

  // Mutations
  const uploadFileMutation = useMutation(
    (file: File) => fileApi.uploadFile(file),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['files']);
        queryClient.invalidateQueries(['file-stats']);
        toast.success('File uploaded successfully');
        setIsUploadDialogOpen(false);
        setUploadProgress(0);
        setIsUploading(false);
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.error || 'Failed to upload file');
        setUploadProgress(0);
        setIsUploading(false);
      }
    }
  );

  const deleteFileMutation = useMutation(
    (id: string) => fileApi.deleteFile(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['files']);
        queryClient.invalidateQueries(['file-stats']);
        toast.success('File deleted successfully');
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.error || 'Failed to delete file');
      }
    }
  );

  const bulkDeleteMutation = useMutation(
    (fileIds: string[]) => fileApi.bulkDeleteFiles(fileIds),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['files']);
        queryClient.invalidateQueries(['file-stats']);
        toast.success('Files deleted successfully');
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.error || 'Failed to delete files');
      }
    }
  );

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 100);

      try {
        await uploadFileMutation.mutateAsync(file);
        clearInterval(progressInterval);
        setUploadProgress(100);
      } catch (error) {
        clearInterval(progressInterval);
        break;
      }
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this file?')) {
      deleteFileMutation.mutate(id);
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, file: FileUpload) => {
    setAnchorEl(event.currentTarget);
    setSelectedFileForMenu(file);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedFileForMenu(null);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (date: string) => {
    return format(new Date(date), 'MMM dd, yyyy HH:mm');
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <Image />;
    if (mimeType.startsWith('video/')) return <Movie />;
    if (mimeType.startsWith('audio/')) return <MusicNote />;
    if (mimeType.includes('pdf') || mimeType.includes('document')) return <Description />;
    if (mimeType.includes('zip') || mimeType.includes('rar')) return <Archive />;
    return <Description />;
  };

  const getFileColor = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return 'success';
    if (mimeType.startsWith('video/')) return 'warning';
    if (mimeType.startsWith('audio/')) return 'info';
    if (mimeType.includes('pdf') || mimeType.includes('document')) return 'primary';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return 'secondary';
    return 'default';
  };

  const handleDownload = (file: FileUpload) => {
    window.open(`/api/files/download/${file.id}`, '_blank');
  };

  const handlePreview = (file: FileUpload) => {
    if (file.mimeType.startsWith('image/')) {
      window.open(`/api/files/${file.id}/preview`, '_blank');
    } else {
      setSelectedFile(file);
      setIsViewDialogOpen(true);
    }
  };

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        Failed to load files. Please try again.
      </Alert>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            File Manager
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Upload, organize, and manage your files
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<CloudUpload />}
            onClick={() => setIsUploadDialogOpen(true)}
          >
            Upload Files
          </Button>
          
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => fileInputRef.current?.click()}
          >
            Add Files
          </Button>
        </Box>
      </Box>

      {/* Statistics Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Avatar sx={{ bgcolor: 'primary.main', mr: 2 }}>
                  <Folder />
                </Avatar>
                <Box>
                  <Typography variant="h6">
                    {statsData?.totalFiles || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Files
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Avatar sx={{ bgcolor: 'success.main', mr: 2 }}>
                  <Image />
                </Avatar>
                <Box>
                  <Typography variant="h6">
                    {formatFileSize(statsData?.totalSize || 0)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Size
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Avatar sx={{ bgcolor: 'warning.main', mr: 2 }}>
                  <Description />
                </Avatar>
                <Box>
                  <Typography variant="h6">
                    {statsData?.fileTypes?.length || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    File Types
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Avatar sx={{ bgcolor: 'info.main', mr: 2 }}>
                  <Upload />
                </Avatar>
                <Box>
                  <Typography variant="h6">
                    {statsData?.recentUploads?.length || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Recent Uploads
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters and Search */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                placeholder="Search files..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            
            <Grid item xs={12} md={2}>
              <FormControl fullWidth>
                <InputLabel>Type</InputLabel>
                <Select
                  value={type}
                  label="Type"
                  onChange={(e) => setType(e.target.value)}
                >
                  <MenuItem value="">All Types</MenuItem>
                  <MenuItem value="image">Images</MenuItem>
                  <MenuItem value="video">Videos</MenuItem>
                  <MenuItem value="audio">Audio</MenuItem>
                  <MenuItem value="application">Documents</MenuItem>
                  <MenuItem value="text">Text Files</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={2}>
              <FormControl fullWidth>
                <InputLabel>Sort By</InputLabel>
                <Select
                  value={sortBy}
                  label="Sort By"
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <MenuItem value="createdAt">Date Uploaded</MenuItem>
                  <MenuItem value="originalName">Name</MenuItem>
                  <MenuItem value="size">Size</MenuItem>
                  <MenuItem value="mimeType">Type</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={2}>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<Refresh />}
                onClick={() => {
                  setSearch('');
                  setType('');
                  setSortBy('createdAt');
                  setSortOrder('desc');
                }}
              >
                Reset
              </Button>
            </Grid>
            
            <Grid item xs={12} md={2}>
              <Button
                fullWidth
                variant="outlined"
                onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
              >
                {viewMode === 'grid' ? 'List View' : 'Grid View'}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Files Display */}
      <Card>
        <CardContent>
          {isLoading ? (
            <Grid container spacing={2}>
              {[...Array(8)].map((_, index) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={index}>
                  <Skeleton variant="rectangular" height={200} />
                  <Skeleton variant="text" sx={{ mt: 1 }} />
                  <Skeleton variant="text" width="60%" />
                </Grid>
              ))}
            </Grid>
          ) : (
            <>
              {viewMode === 'grid' ? (
                <Grid container spacing={2}>
                  {filesData?.files?.map((file) => (
                    <Grid item xs={12} sm={6} md={4} lg={3} key={file.id}>
                      <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <CardContent sx={{ flexGrow: 1 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                            <Avatar
                              sx={{
                                width: 80,
                                height: 80,
                                bgcolor: `${getFileColor(file.mimeType)}.main`
                              }}
                            >
                              {getFileIcon(file.mimeType)}
                            </Avatar>
                          </Box>
                          
                          <Typography variant="subtitle2" noWrap>
                            {file.originalName}
                          </Typography>
                          
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            {formatFileSize(file.size)}
                          </Typography>
                          
                          <Chip
                            label={file.mimeType.split('/')[1]?.toUpperCase() || 'FILE'}
                            color={getFileColor(file.mimeType) as any}
                            size="small"
                            sx={{ mb: 1 }}
                          />
                          
                          <Typography variant="caption" color="text.secondary">
                            {formatDate(file.createdAt)}
                          </Typography>
                        </CardContent>
                        
                        <Box sx={{ p: 1, display: 'flex', justifyContent: 'space-between' }}>
                          <IconButton
                            size="small"
                            onClick={() => handlePreview(file)}
                          >
                            <Visibility />
                          </IconButton>
                          
                          <IconButton
                            size="small"
                            onClick={() => handleDownload(file)}
                          >
                            <Download />
                          </IconButton>
                          
                          <IconButton
                            size="small"
                            onClick={(e) => handleMenuOpen(e, file)}
                          >
                            <MoreVert />
                          </IconButton>
                        </Box>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              ) : (
                <List>
                  {filesData?.files?.map((file) => (
                    <ListItem key={file.id} divider>
                      <ListItemAvatar>
                        <Avatar sx={{ bgcolor: `${getFileColor(file.mimeType)}.main` }}>
                          {getFileIcon(file.mimeType)}
                        </Avatar>
                      </ListItemAvatar>
                      
                      <ListItemText
                        primary={file.originalName}
                        secondary={
                          <Box>
                            <Typography variant="body2" color="text.secondary">
                              {formatFileSize(file.size)} • {formatDate(file.createdAt)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Uploaded by {file.uploadedByUser?.firstName} {file.uploadedByUser?.lastName}
                            </Typography>
                          </Box>
                        }
                      />
                      
                      <ListItemSecondaryAction>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Tooltip title="Preview">
                            <IconButton
                              size="small"
                              onClick={() => handlePreview(file)}
                            >
                              <Visibility />
                            </IconButton>
                          </Tooltip>
                          
                          <Tooltip title="Download">
                            <IconButton
                              size="small"
                              onClick={() => handleDownload(file)}
                            >
                              <Download />
                            </IconButton>
                          </Tooltip>
                          
                          <IconButton
                            size="small"
                            onClick={(e) => handleMenuOpen(e, file)}
                          >
                            <MoreVert />
                          </IconButton>
                        </Box>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              )}
              
              {/* Pagination */}
              {filesData?.pagination && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                  <Pagination
                    count={filesData.pagination.pages}
                    page={page}
                    onChange={(_, value) => setPage(value)}
                    color="primary"
                  />
                </Box>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={isUploadDialogOpen} onClose={() => setIsUploadDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Upload Files</DialogTitle>
        <DialogContent>
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileUpload}
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar"
            />
            
            <CloudUpload sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            
            <Typography variant="h6" gutterBottom>
              Drag and drop files here
            </Typography>
            
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              or click to browse files
            </Typography>
            
            <Button
              variant="contained"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              Select Files
            </Button>
            
            {isUploading && (
              <Box sx={{ mt: 2 }}>
                <LinearProgress variant="determinate" value={uploadProgress} />
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Uploading... {uploadProgress}%
                </Typography>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsUploadDialogOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>

      {/* File Details Dialog */}
      <Dialog open={isViewDialogOpen} onClose={() => setIsViewDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>File Details</DialogTitle>
        <DialogContent>
          {selectedFile && (
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>File Information</Typography>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">Name</Typography>
                  <Typography variant="body1">{selectedFile.originalName}</Typography>
                </Box>
                
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">Size</Typography>
                  <Typography variant="body1">{formatFileSize(selectedFile.size)}</Typography>
                </Box>
                
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">Type</Typography>
                  <Typography variant="body1">{selectedFile.mimeType}</Typography>
                </Box>
                
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">Uploaded</Typography>
                  <Typography variant="body1">{formatDate(selectedFile.createdAt)}</Typography>
                </Box>
                
                {selectedFile.uploadedByUser && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary">Uploaded By</Typography>
                    <Typography variant="body1">
                      {selectedFile.uploadedByUser.firstName} {selectedFile.uploadedByUser.lastName}
                    </Typography>
                  </Box>
                )}
              </Grid>
              
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>Actions</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Button
                    variant="outlined"
                    startIcon={<Download />}
                    onClick={() => handleDownload(selectedFile)}
                    fullWidth
                  >
                    Download
                  </Button>
                  
                  {selectedFile.mimeType.startsWith('image/') && (
                    <Button
                      variant="outlined"
                      startIcon={<Visibility />}
                      onClick={() => handlePreview(selectedFile)}
                      fullWidth
                    >
                      Preview
                    </Button>
                  )}
                  
                  <Button
                    variant="outlined"
                    startIcon={<Info />}
                    fullWidth
                  >
                    Get Link
                  </Button>
                </Box>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsViewDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* File Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItemComponent onClick={() => {
          if (selectedFileForMenu) {
            handlePreview(selectedFileForMenu);
          }
          handleMenuClose();
        }}>
          <Visibility sx={{ mr: 1 }} />
          Preview
        </MenuItemComponent>
        
        <MenuItemComponent onClick={() => {
          if (selectedFileForMenu) {
            handleDownload(selectedFileForMenu);
          }
          handleMenuClose();
        }}>
          <Download sx={{ mr: 1 }} />
          Download
        </MenuItemComponent>
        
        <MenuItemComponent onClick={() => {
          if (selectedFileForMenu) {
            setSelectedFile(selectedFileForMenu);
            setIsViewDialogOpen(true);
          }
          handleMenuClose();
        }}>
          <Info sx={{ mr: 1 }} />
          Details
        </MenuItemComponent>
        
        <Divider />
        
        <MenuItemComponent onClick={() => {
          if (selectedFileForMenu) {
            handleDelete(selectedFileForMenu.id);
          }
          handleMenuClose();
        }}>
          <DeleteForever sx={{ mr: 1 }} />
          Delete
        </MenuItemComponent>
      </Menu>
    </Box>
  );
};

export default FileManager;