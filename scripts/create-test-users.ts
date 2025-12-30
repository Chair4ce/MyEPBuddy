import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'http://127.0.0.1:54321'
const serviceRoleKey = 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz'

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

const testUsers = [
  { rank: 'AB', email: 'ab.test@myepbuddy.test', name: 'Aaron Brown', afsc: '3D0X2', unit: '25 IS', role: 'subordinate' },
  { rank: 'Amn', email: 'amn.test@myepbuddy.test', name: 'Amy Nelson', afsc: '1N0X1', unit: '25 IS', role: 'subordinate' },
  { rank: 'A1C', email: 'a1c.test@myepbuddy.test', name: 'Alex Carter', afsc: '1N4X1', unit: '25 IS', role: 'subordinate' },
  { rank: 'SrA', email: 'sra.test@myepbuddy.test', name: 'Sarah Adams', afsc: '1N2X1', unit: '25 IS', role: 'subordinate' },
  { rank: 'SSgt', email: 'ssgt.test@myepbuddy.test', name: 'Steven Smith', afsc: '1N0X1', unit: '25 IS', role: 'supervisor' },
  { rank: 'TSgt', email: 'tsgt.test@myepbuddy.test', name: 'Thomas Turner', afsc: '1N0X1', unit: '25 IS', role: 'supervisor' },
  { rank: 'MSgt', email: 'msgt.test@myepbuddy.test', name: 'Michael Martinez', afsc: '1N0X1', unit: '25 IS', role: 'supervisor' },
  { rank: 'SMSgt', email: 'smsgt.test@myepbuddy.test', name: 'Sandra Moore', afsc: '1N0X1', unit: '25 IS', role: 'supervisor' },
  { rank: 'CMSgt', email: 'cmsgt.test@myepbuddy.test', name: 'Christopher Clark', afsc: '1N0X1', unit: '25 IS', role: 'supervisor' },
]

async function createTestUsers() {
  console.log('Creating test users...\n')
  
  for (const user of testUsers) {
    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: user.email,
      password: 'Test123!',
      email_confirm: true,
      user_metadata: {
        full_name: user.name,
        rank: user.rank,
        afsc: user.afsc,
        unit: user.unit,
        role: user.role
      }
    })
    
    if (authError) {
      console.log(`❌ ${user.rank} - ${user.email}: ${authError.message}`)
      continue
    }
    
    // Update profile
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        full_name: user.name,
        rank: user.rank,
        afsc: user.afsc,
        unit: user.unit,
        role: user.role
      })
      .eq('id', authData.user.id)
    
    if (profileError) {
      console.log(`❌ ${user.rank} profile update failed: ${profileError.message}`)
    } else {
      console.log(`✅ ${user.rank} - ${user.email} (Password: Test123!)`)
    }
  }
  
  console.log('\n✨ Done! All test accounts use password: Test123!')
}

createTestUsers()





