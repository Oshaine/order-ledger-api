const { SystemSettings } = require('../models');
const { logAudit } = require('../middleware/audit');
const fs = require('fs');
const path = require('path');

const getSystemSettings = async (req, res) => {
  try {
    let settings = await SystemSettings.findOne({
      order: [['createdAt', 'ASC']]
    });

    // If no settings exist, create default
    if (!settings) {
      settings = await SystemSettings.create({
        primaryColor: '59 130 246',
        businessName: '',
        businessLogo: null,
        discountMessage: '',
        thankYouMessage: 'Thank you for your business!',
        phoneNumber: '',
        email: ''
      });
    }

    res.json({
      primaryColor: settings.primaryColor,
      businessName: settings.businessName || '',
      businessLogo: settings.businessLogo || null,
      discountMessage: settings.discountMessage || '',
      thankYouMessage: settings.thankYouMessage || '',
      phoneNumber: settings.phoneNumber || '',
      email: settings.email || ''
    });
  } catch (error) {
    console.error('Get system settings error:', error);
    res.status(500).json({ error: 'Failed to fetch system settings' });
  }
};

const updateSystemSettings = async (req, res) => {
  try {
    let settings = await SystemSettings.findOne({
      order: [['createdAt', 'ASC']]
    });

    // If no settings exist, create it
    if (!settings) {
      settings = await SystemSettings.create({
        primaryColor: '59 130 246',
        businessName: '',
        businessLogo: null,
        discountMessage: '',
        thankYouMessage: 'Thank you for your business!',
        phoneNumber: '',
        email: ''
      });
    }

    const { primaryColor, businessName, discountMessage, thankYouMessage, phoneNumber, email } = req.body;

    if (primaryColor !== undefined) {
      // Validate primaryColor format (should be "R G B" format)
      const colorRegex = /^\d{1,3}\s\d{1,3}\s\d{1,3}$/;
      if (!colorRegex.test(primaryColor)) {
        return res.status(400).json({ error: 'Invalid primary color format. Expected format: "R G B" (e.g., "59 130 246")' });
      }
      
      // Validate RGB values are between 0-255
      const [r, g, b] = primaryColor.split(' ').map(Number);
      if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
        return res.status(400).json({ error: 'RGB values must be between 0 and 255' });
      }

      settings.primaryColor = primaryColor;
    }

    if (businessName !== undefined) {
      settings.businessName = businessName || '';
    }

    // Handle logo upload
    if (req.file) {
      // Delete old logo if exists
      if (settings.businessLogo) {
        const oldLogoPath = settings.businessLogo.replace('/uploads', 'uploads');
        if (fs.existsSync(oldLogoPath)) {
          fs.unlinkSync(oldLogoPath);
        }
      }
      settings.businessLogo = `/uploads/logo/${req.file.filename}`;
    }

    if (discountMessage !== undefined) {
      settings.discountMessage = discountMessage || '';
    }

    if (thankYouMessage !== undefined) {
      settings.thankYouMessage = thankYouMessage || '';
    }

    if (phoneNumber !== undefined) {
      settings.phoneNumber = phoneNumber || '';
    }

    if (email !== undefined) {
      settings.email = email || '';
    }

    await settings.save();

    await logAudit(req, 'UPDATE_SYSTEM_SETTINGS', 'SystemSettings', settings.id, { 
      primaryColor: settings.primaryColor,
      businessName: settings.businessName,
      businessLogo: settings.businessLogo,
      discountMessage: settings.discountMessage,
      thankYouMessage: settings.thankYouMessage,
      phoneNumber: settings.phoneNumber,
      email: settings.email
    });

    res.json({
      primaryColor: settings.primaryColor,
      businessName: settings.businessName || '',
      businessLogo: settings.businessLogo || null,
      discountMessage: settings.discountMessage || '',
      thankYouMessage: settings.thankYouMessage || '',
      phoneNumber: settings.phoneNumber || '',
      email: settings.email || ''
    });
  } catch (error) {
    console.error('Update system settings error:', error);
    res.status(500).json({ error: 'Failed to update system settings' });
  }
};

module.exports = {
  getSystemSettings,
  updateSystemSettings
};

