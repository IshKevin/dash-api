# 🔑 Admin Body Request Format

## Overview
Admins can create pest management requests on behalf of farmers using a specialized body format that includes full disease and pest details directly in the request.

---

## 📋 Admin Request Body

### Complete Example
```json
{
  "disease": {
    "name": "Tip Burn / Leaf Burn",
    "symptoms": "Brown leaf tips and margins",
    "index": "11"
  },
  "pest": {
    "name": "Avocado brown mite",
    "damage": "Causes bronzing of leaves",
    "index": "12"
  },
  "pestNoticed": "this_week",
  "controlMethods": "Applied neem oil twice weekly, copper spray on affected areas",
  "primaryImage": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD...",
  "secondaryImage": null,
  "farmer_id": "673ba8e4056a2c58ce7bfd65",
  "location": {
    "province": "Eastern Province",
    "district": "Rwamagana",
    "sector": "Muhazi",
    "cell": "Gahini",
    "village": "Kajevuba"
  },
  "priority": "high",
  "notes": "Urgent case - multiple trees affected"
}
```

---

## 🔑 Field Reference

### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `disease` OR `pest` | object | At least one must be provided | See below |
| `pestNoticed` | string | When issue was noticed | `this_week`, `this_month`, `few_months`, `over_6_months` |
| `farmer_id` | string | MongoDB ObjectID of farmer | `"673ba8e4056a2c58ce7bfd65"` |

### Disease Object (Optional)

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `name` | string | **Yes** | Disease name | `"Tip Burn / Leaf Burn"` |
| `symptoms` | string | **Yes** | Symptom description | `"Brown leaf tips and margins"` |
| `index` | string | No | Disease index/code | `"11"` |

### Pest Object (Optional)

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `name` | string | **Yes** | Pest name | `"Avocado brown mite"` |
| `damage` | string | **Yes** | Damage description | `"Causes bronzing of leaves"` |
| `index` | string | No | Pest index/code | `"12"` |

### Optional Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `controlMethods` | string | Control methods tried (max 1000 chars) | `"Applied treatments..."` |
| `primaryImage` | string | Base64 image or URL | `"data:image/jpeg;base64,..."` |
| `secondaryImage` | string | Base64 image or URL | `"data:image/jpeg;base64,..."` |
| `location` | object | Override farmer's location | `{"province": "..."}` |
| `priority` | string | Request priority | `low`, `medium`, `high`, `urgent` |
| `notes` | string | Additional notes | Any text |

---

## 🧪 Test Examples

### Example 1: Disease Only
```json
{
  "disease": {
    "name": "Phytophthora Root Rot",
    "symptoms": "Wilting leaves despite adequate water",
    "index": "5"
  },
  "pestNoticed": "this_month",
  "controlMethods": "Improved drainage, applied fungicide",
  "farmer_id": "673ba8e4056a2c58ce7bfd65"
}
```

### Example 2: Pest Only
```json
{
  "pest": {
    "name": "Avocado thrips",
    "damage": "Causes scarring on fruit skin",
    "index": "8"
  },
  "pestNoticed": "this_week",
  "controlMethods": "Applied insecticidal soap",
  "farmer_id": "673ba8e4056a2c58ce7bfd65",
  "priority": "high"
}
```

### Example 3: Both Disease and Pest
```json
{
  "disease": {
    "name": "Anthracnose",
    "symptoms": "Dark circular spots on fruit",
    "index": "3"
  },
  "pest": {
    "name": "Spider mites",
    "damage": "Creates fine webbing on leaves",
    "index": "14"
  },
  "pestNoticed": "few_months",
  "controlMethods": "Copper spray every 10 days, miticide application, removed infected parts",
  "primaryImage": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD...",
  "farmer_id": "673ba8e4056a2c58ce7bfd65",
  "location": {
    "province": "Southern Province",
    "district": "Huye",
    "sector": "Tumba"
  },
  "priority": "urgent",
  "notes": "Multiple trees showing severe symptoms, spreading rapidly"
}
```

### Example 4: Minimal Request
```json
{
  "disease": {
    "name": "Tip Burn",
    "symptoms": "Brown leaf tips"
  },
  "pestNoticed": "this_week",
  "farmer_id": "673ba8e4056a2c58ce7bfd65"
}
```

---

## 📤 Expected Response

```json
{
  "success": true,
  "data": {
    "id": "673d1234567890abcdef1234",
    "request_number": "PC-1732122450-AB12",
    "farmer_id": "673ba8e4056a2c58ce7bfd65",
    "agent_id": null,
    "service_type": "pest_control",
    "title": "Pest Control: Tip Burn / Leaf Burn & Avocado brown mite",
    "status": "pending",
    "priority": "high",
    "location": {
      "province": "Eastern Province",
      "district": "Rwamagana",
      "sector": "Muhazi",
      "cell": "Gahini",
      "village": "Kajevuba"
    },
    "pest_management_details": {
      "pests_diseases": [
        {
          "name": "Tip Burn / Leaf Burn",
          "type": "disease",
          "symptoms": "Brown leaf tips and margins",
          "index": "11",
          "order": 1,
          "is_primary": true,
          "first_spotted_date": "2025-11-20T15:00:00.000Z"
        },
        {
          "name": "Avocado brown mite",
          "type": "pest",
          "damage": "Causes bronzing of leaves",
          "index": "12",
          "order": 2,
          "is_primary": false,
          "first_spotted_date": "2025-11-20T15:00:00.000Z"
        }
      ],
      "first_noticed": "this_week",
      "severity_level": "critical",
      "control_methods_tried": "Applied neem oil twice weekly, copper spray on affected areas",
      "damage_observed": "Brown leaf tips and margins; Causes bronzing of leaves"
    },
    "farmer_info": {
      "name": "John Doe",
      "phone": "+250788123456",
      "email": "john@example.com",
      "location": "Kajevuba, Gahini, Muhazi, Rwamagana, Eastern Province"
    },
    "attachments": ["data:image/jpeg;base64,..."],
    "notes": "Urgent case - multiple trees affected",
    "created_by": "673da8e4056a2c58ce7bfd99",
    "created_at": "2025-11-20T15:00:00.000Z",
    "updated_at": "2025-11-20T15:00:00.000Z"
  },
  "message": "Pest management request submitted successfully"
}
```

---

## 🔌 API Endpoint

```
POST /api/service-requests/pest-management
Authorization: Bearer ADMIN_TOKEN
Content-Type: application/json
```

---

## 🧪 cURL Test Command

```bash
curl -X POST "http://localhost:5000/api/service-requests/pest-management" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "disease": {
      "name": "Tip Burn / Leaf Burn",
      "symptoms": "Brown leaf tips and margins",
      "index": "11"
    },
    "pest": {
      "name": "Avocado brown mite",
      "damage": "Causes bronzing of leaves",
      "index": "12"
    },
    "pestNoticed": "this_week",
    "controlMethods": "Applied neem oil and copper spray",
    "farmer_id": "673ba8e4056a2c58ce7bfd65",
    "priority": "high"
  }'
```

---

## ⚠️ Validation Rules

| Rule | Description | Error Message |
|------|-------------|---------------|
| ✅ Admin role | Must be authenticated as admin | "Unauthorized" |
| ✅ farmer_id required | Must provide valid farmer ID | "farmer_id is required" |
| ✅ Farmer exists | farmer_id must reference existing farmer | "Invalid farmer_id provided" |
| ✅ At least one | Must provide disease OR pest object | "At least one pest or disease must be provided" |
| ✅ Disease name | If disease provided, name is required | "Disease name must be a string" |
| ✅ Disease symptoms | If disease provided, symptoms is required | "Disease symptoms must be a string" |
| ✅ Pest name | If pest provided, name is required | "Pest name must be a string" |
| ✅ Pest damage | If pest provided, damage is required | "Pest damage must be a string" |
| ✅ pestNoticed | Must be valid timeframe | "Pest noticed timeframe is required" |

---

## 🎯 pestNoticed Values

| Value | Severity | Description |
|-------|----------|-------------|
| `this_week` | Critical | Noticed in last 7 days |
| `this_month` | High | Noticed in last 30 days |
| `few_months` | Medium | Noticed 2-6 months ago |
| `over_6_months` | Low | Noticed 6+ months ago |

---

## 🔄 Format Comparison

### Admin Format (Direct Details)
```json
{
  "disease": {
    "name": "Tip Burn",
    "symptoms": "Brown leaf tips",
    "index": "11"
  },
  "pestNoticed": "this_week",
  "farmer_id": "673ba..."
}
```

### Farmer Format (Auto-Fill)
```json
{
  "disease_symptoms": "Brown leaf tips and margins",
  "pestNoticed": "this_week"
}
```

### Legacy Format (Still Works)
```json
{
  "disease_id": "673d...",
  "pestNoticed": "this_week"
}
```

---

## 💡 Key Differences from Farmer Format

| Feature | Admin | Farmer |
|---------|-------|--------|
| **Disease Input** | Full object with name + symptoms | Select symptom category |
| **Pest Input** | Full object with name + damage | Select damage category |
| **Auto-Fill** | ❌ Not needed (direct input) | ✅ System fills disease/pest name |
| **farmer_id** | ✅ Required | ❌ Uses authenticated user |
| **Index Field** | ✅ Supported | ❌ Not available |
| **controlMethods** | Optional | Required |

---

## 📊 Use Cases

### When to Use Admin Format:
1. ✅ Creating requests on behalf of farmers via admin portal
2. ✅ Bulk import of pest management data
3. ✅ Manual data entry by admin staff
4. ✅ When you have complete pest/disease information
5. ✅ When using indexed disease/pest codes
6. ✅ Emergency cases requiring direct admin intervention

### When NOT to Use:
1. ❌ Farmers submitting their own requests (use farmer format)
2. ❌ When selecting from existing pest/disease database (use farmer format)
3. ❌ Frontend dropdown-based forms (use farmer format)

---

## 🚀 Integration Example (JavaScript)

```javascript
const createPestManagementRequest = async (farmerId, diseaseData, pestData) => {
  const response = await fetch('http://localhost:5000/api/service-requests/pest-management', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      disease: diseaseData ? {
        name: diseaseData.name,
        symptoms: diseaseData.symptoms,
        index: diseaseData.index
      } : undefined,
      pest: pestData ? {
        name: pestData.name,
        damage: pestData.damage,
        index: pestData.index
      } : undefined,
      pestNoticed: 'this_week',
      controlMethods: 'Applied treatments',
      farmer_id: farmerId,
      priority: 'high'
    })
  });
  
  return await response.json();
};

// Usage
const result = await createPestManagementRequest(
  '673ba8e4056a2c58ce7bfd65',
  { 
    name: 'Tip Burn',
    symptoms: 'Brown leaf tips',
    index: '11'
  },
  {
    name: 'Avocado brown mite',
    damage: 'Causes bronzing',
    index: '12'
  }
);

console.log('✅ Request created:', result.data.request_number);
```

---

## 🧪 Testing Checklist

### Admin Authentication
- [ ] Login as admin
- [ ] Verify admin role
- [ ] Get valid farmer_id

### Disease Only Request
- [ ] Create with disease object
- [ ] Include name, symptoms, index
- [ ] Verify disease saved correctly

### Pest Only Request
- [ ] Create with pest object
- [ ] Include name, damage, index
- [ ] Verify pest saved correctly

### Both Disease and Pest
- [ ] Create with both objects
- [ ] Verify correct order (disease primary)
- [ ] Check index values preserved

### Optional Fields
- [ ] Test with images
- [ ] Test with custom location
- [ ] Test with priority and notes
- [ ] Test without controlMethods (should work)

---

## ✅ Success Criteria

**Admin submits:**
```json
{
  "disease": {"name": "Tip Burn", "symptoms": "Brown tips", "index": "11"},
  "pestNoticed": "this_week",
  "farmer_id": "673ba..."
}
```

**System creates:**
```json
{
  "title": "Pest Control: Tip Burn",
  "pest_management_details": {
    "pests_diseases": [{
      "name": "Tip Burn",
      "symptoms": "Brown tips",
      "index": "11"
    }]
  }
}
```

**✅ Disease and index preserved exactly as submitted!**

---

## 🔧 Error Handling

### Missing farmer_id
```json
{
  "success": false,
  "message": "farmer_id is required when admin creates a pest management request"
}
```

### Invalid farmer_id
```json
{
  "success": false,
  "message": "Invalid farmer_id provided"
}
```

### Missing disease/pest
```json
{
  "success": false,
  "message": "At least one pest or disease must be provided"
}
```

### Incomplete disease object
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {"msg": "Disease name must be a string", "param": "disease.name"}
  ]
}
```

---

**Last Updated:** November 20, 2025  
**Status:** ✅ Fully Implemented and Working  
**Access:** Admin Only
