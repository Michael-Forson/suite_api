# InDepth Core Platform Architecture

**Core Database Structure and Feature Functions**

**Focus:** users, organizations, members, apps, roles, and permissions.

---

## 1. Simple System Understanding

The Core Platform is the control center of InDepth. It manages who users are, which business they belong to, which apps the business has enabled, and what each person can do inside each app.

- **User** = the person who logs in.
- **Organization** = the business account.
- **Organization Member** = the user inside a business.
- **App** = a software product such as POS, Inventory, CRM, Attendance, or Accounting.
- **Organization Role** = the user’s power over the business account.
- **App Role** = the user’s job inside a specific app.
- **Permission** = a specific action allowed inside an app.

**Main rule:** Keep the backend powerful, but keep the business user experience simple.

---

## 2. High-Level Access Flow

1. A user creates an account or logs in.
2. The user creates or joins an organization.
3. The organization enables apps such as POS, Inventory, or Accounting.
4. The owner or admin assigns app roles to staff.
5. Each app checks the Core Platform before allowing any protected action.

---

## 3. Final Core Database Structure

This structure focuses only on the core platform. Subscriptions, payments, AI, analytics, and app-specific tables can be added later.

---

### 3.1 `users`

**Purpose:** Stores the global user account used for login across the InDepth ecosystem.

| Field | Meaning |
|---|---|
| `id` | Primary identifier of the user. |
| `email` | Unique email address used for login. |
| `phone` | Optional phone number. |
| `password_hash` | Secure hashed password. |
| `avatar_url` | Optional user profile image. |
| `status` | Account status such as active, inactive, suspended, or disabled. |
| `email_verified` | Shows whether the user has verified their email. |
| `last_login_at` | Last time the user logged in. |
| `created_at` | When the record was created. |
| `updated_at` | When the record was last updated. |

---

### 3.2 `organizations`

**Purpose:** Stores each business account on the platform.

| Field | Meaning |
|---|---|
| `id` | Primary identifier of the organization. |
| `name` | Business name. |
| `slug` | Unique readable organization identifier. |
| `owner_id` | User who owns the business account. |
| `business_type` | Type of business, such as company, shop, agency, or school. |
| `industry` | Industry category. |
| `email` | Business email address. |
| `phone` | Business phone number. |
| `logo_url` | Business logo. |
| `country` | Country where the business operates. |
| `city` | City where the business operates. |
| `address` | Business address. |
| `status` | Organization status such as active, inactive, suspended, or disabled. |
| `created_at` | When the organization was created. |
| `updated_at` | When the organization was last updated. |

---

### 3.3 `organization_members`

**Purpose:** Connects users to organizations and stores their organization-level role.

| Field | Meaning |
|---|---|
| `id` | Primary identifier of the organization member record. |
| `organization_id` | The organization the user belongs to. |
| `user_id` | The user who belongs to the organization. |
| `organization_role` | Owner, admin, or member. |
| `job_title` | Human-friendly job title shown to business users. |
| `status` | Member status such as active, inactive, pending, or suspended. |
| `invited_by` | User who invited this member. |
| `joined_at` | When the user joined the organization. |
| `created_at` | When the record was created. |
| `updated_at` | When the record was last updated. |

---

### 3.4 `apps`

**Purpose:** Stores all apps that exist in the InDepth ecosystem.

| Field | Meaning |
|---|---|
| `id` | Primary identifier of the app. |
| `name` | Display name of the app. |
| `key` | Unique app key used by the backend. |
| `description` | Short description of the app. |
| `icon_url` | Optional icon used in the dashboard. |
| `app_url` | URL where the app frontend or service lives. |
| `status` | App status such as active or disabled. |
| `is_standalone` | Shows whether the app can be sold as a separate SaaS. |
| `created_at` | When the app record was created. |
| `updated_at` | When the app record was last updated. |

---

### 3.5 `organization_apps`

**Purpose:** Controls which organization has access to which app.

| Field | Meaning |
|---|---|
| `id` | Primary identifier of the organization app access record. |
| `organization_id` | The organization receiving app access. |
| `app_id` | The app enabled for the organization. |
| `status` | Access status such as active, disabled, or suspended. |
| `access_type` | Access type such as free, trial, paid, or internal. |
| `enabled_by` | User who enabled the app. |
| `enabled_at` | When the app was enabled. |
| `disabled_at` | When the app was disabled, if applicable. |
| `created_at` | When the record was created. |
| `updated_at` | When the record was last updated. |

---

### 3.6 `AppPermission` (`permissions` table)

**Purpose:** Stores all possible actions that can be performed inside apps.
The app-specific model name leaves room for a future organization-scoped
permission model without introducing an ambiguous generic `Permission` type.

| Field | Meaning |
|---|---|
| `id` | Primary identifier of the permission. |
| `app_id` | The app this permission belongs to. |
| `key` | Backend permission key, such as `pos.sale.create`. |
| `label` | Human-friendly name shown in the UI. |
| `description` | What the permission allows. |
| `category` | UI grouping such as Sales, Stock, Reports, or Settings. |
| `is_system_permission` | Shows whether this is a built-in platform permission. |
| `status` | Permission status such as active or disabled. |
| `created_at` | When the permission was created. |
| `updated_at` | When the permission was last updated. |

---

### 3.7 `AppRole` (`app_roles` table)

**Purpose:** Stores reusable standard roles for an app. Every organization uses
the same role definitions for that app.

| Field | Meaning |
|---|---|
| `id` | Primary identifier of the role. |
| `app_id` | The app this role belongs to. |
| `key` | Stable backend role key, such as `manager` or `staff`. |
| `name` | Role name shown to business users. |
| `description` | Short explanation of the role. |
| `is_default` | Shows whether this role is assigned by default. |
| `status` | Role status such as active or disabled. |
| `created_at` | When the role was created. |
| `updated_at` | When the role was last updated. |

---

### 3.8 `AppRolePermission` (`app_role_permissions` table)

**Purpose:** Connects standard app roles to app permissions.

| Field | Meaning |
|---|---|
| `id` | Primary identifier of the role permission record. |
| `app_role_id` | The `AppRole` receiving the permission. |
| `permission_id` | The `AppPermission` attached to the role. |
| `created_at` | When the record was created. |

---

### 3.9 `member_app_roles`

**Purpose:** Assigns organization members to roles inside specific apps.

| Field | Meaning |
|---|---|
| `id` | Primary identifier of the member app role record. |
| `organization_member_id` | The organization member receiving the app role. |
| `app_id` | The app where the role applies. |
| `app_role_id` | `AppRole` assigned to the member inside the app. |
| `status` | Assignment status such as active or disabled. |
| `assigned_by` | User who assigned the role. |
| `assigned_at` | When the role was assigned. |
| `created_at` | When the record was created. |
| `updated_at` | When the record was last updated. |

---

### 3.10 `organization_invitations`

**Purpose:** Stores staff invitations before a user joins an organization.

| Field | Meaning |
|---|---|
| `id` | Primary identifier of the invitation. |
| `organization_id` | Organization sending the invitation. |
| `email` | Email address being invited. |
| `invited_by` | User who sent the invitation. |
| `organization_role` | Owner, admin, or member role assigned during invitation. |
| `status` | Invitation status such as pending, accepted, expired, or revoked. |
| `token` | Secure invitation token. |
| `expires_at` | When the invitation expires. |
| `accepted_at` | When the invitation was accepted. |
| `created_at` | When the invitation was created. |
| `updated_at` | When the invitation was last updated. |

---

## 4. Database Relationships

- `organizations.owner_id` → `users.id`
- `organization_members.organization_id` → `organizations.id`
- `organization_members.user_id` → `users.id`
- `organization_members.invited_by` → `users.id`
- `organization_apps.organization_id` → `organizations.id`
- `organization_apps.app_id` → `apps.id`
- `organization_apps.enabled_by` → `users.id`
- `permissions.app_id` → `apps.id`
- `app_roles.app_id` → `apps.id`
- `app_role_permissions.app_role_id` → `app_roles.id`
- `app_role_permissions.permission_id` → `permissions.id`
- `member_app_roles.organization_member_id` → `organization_members.id`
- `member_app_roles.app_id` → `apps.id`
- `member_app_roles.app_role_id` → `app_roles.id`
- `member_app_roles.assigned_by` → `users.id`
- `organization_invitations.organization_id` → `organizations.id`
- `organization_invitations.invited_by` → `users.id`

---

## 5. Important Unique Rules

- `users.email` should be unique.
- `organizations.slug` should be unique.
- `apps.key` should be unique.
- `organization_members` should be unique by `organization_id + user_id`.
- `organization_apps` should be unique by `organization_id + app_id`.
- `permissions` should be unique by `app_id + key`.
- `app_roles` should be unique by `app_id + key` and `app_id + name`.
- Each app should have at most one default active role.
- `app_role_permissions` should be unique by `app_role_id + permission_id`.
- `member_app_roles` should be unique by `organization_member_id + app_id`.

---

## 6. Organization-Level Roles

Organization-level roles control the user’s power over the business account, not what the user can do inside every app.

| Role | Meaning | Main Control Level |
|---|---|---|
| Owner | Main controller of the business account. | Full control, including ownership-level actions. |
| Admin | Trusted manager of the business account. | Almost full control, but cannot remove the owner, transfer ownership, or delete the business. |
| Member | Normal staff member. | No organization control. Uses only assigned apps and app roles. |

---

## 7. Core Feature Functions

This section lists the main backend functions/actions that should exist under each core feature.

### 7.1 User Functions

- Register user account.
- Login user.
- Logout user.
- Verify email.
- Reset password.
- Update user profile.
- Change password.
- Suspend or disable user account.
- Get current logged-in user.

### 7.2 Organization Functions

- Create organization.
- Update organization profile.
- Update organization logo.
- Change organization status.
- Get organization details.
- List organizations the user belongs to.
- Transfer ownership through a controlled process.
- Request organization deletion.

### 7.3 Organization Member Functions

- Invite staff to organization.
- Accept organization invitation.
- List organization members.
- Update member job title.
- Change member organization role.
- Remove member from organization.
- Disable or suspend member access.
- Prevent admins from removing the owner.

### 7.4 App Registry Functions

- Create/register an app in the ecosystem.
- Update app details.
- Activate or disable an app.
- List available apps.
- Get app details by app key.
- Mark whether an app is standalone or suite-only.

### 7.5 Organization App Access Functions

- Enable app for organization.
- Disable app for organization.
- List apps enabled for organization.
- Check whether organization has access to an app.
- Track who enabled or disabled app access.

### 7.6 Permission Functions

- Create system permission.
- List permissions by app.
- Group permissions by category for simple UI display.
- Update permission label or description.
- Disable permission if no longer used.

### 7.7 Role Functions

- Create a reusable role for an app.
- Update role name and description.
- List roles by app.
- Select the default role for each app.
- Disable role.
- Mark role as default.
- Prevent deletion of roles currently assigned to members.

### 7.8 Role Permission Functions

- Attach permission to role.
- Remove permission from role.
- List permissions attached to a role.
- Replace all permissions for a role.
- Validate that permissions belong to the same app as the role.

### 7.9 Member App Role Functions

- Assign member to app role.
- Change member role inside an app.
- Remove member access from an app.
- List member roles across all apps.
- List all users with access to a specific app.
- Ensure one main role per app for a simple business-user experience.

### 7.10 Invitation Functions

- Create staff invitation.
- Send invitation email.
- Validate invitation token.
- Accept invitation.
- Expire old invitations.
- Revoke invitation.
- Resend invitation.

### 7.11 Access Check Functions

- Verify logged-in user.
- Verify user belongs to organization.
- Verify organization has the app enabled.
- Verify member has an app role.
- Verify role has the required permission.
- Return allowed or denied response to app backend.

---

## 8. How App Backends Connect to the Core Backend

Each app can have its own backend and database, but it should rely on the Core Backend for identity, organization access, app access, roles, and permissions.

1. The app backend receives a request from the app frontend.
2. The app backend sends the user token, organization ID, app key, and required permission to the Core Backend.
3. The Core Backend checks the user, organization membership, app access, app role, and permission.
4. The Core Backend returns allowed or denied.
5. The app backend either continues the action or blocks the request.

**Simple backend question:** Can this user perform this action in this organization and app?

---

## 9. Business User Simplicity Rule

The business user should not see technical permission keys. The UI should show simple options.

- Add staff.
- Choose organization role: Owner, Admin, or Member.
- Choose which apps the staff can access.
- Choose the role inside each app.
- Save changes.

The backend may use detailed permission keys, but the frontend should show simple labels such as Create Sales, View Stock, View Reports, or Manage Staff.

---

## 10. Recommended Build Order

1. Build users and authentication.
2. Build organizations.
3. Build organization members.
4. Build apps and organization app access.
5. Build permissions.
6. Build app-level roles.
7. Build role permissions.
8. Build member app roles.
9. Build access-check endpoint for other app backends.
10. Connect the first real app, such as POS.
