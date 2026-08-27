import { test, expect, type Page } from '@playwright/test'

/**
 * These run against the real Contacts API, so every test invents its own
 * contact (unique email per browser project + run) and cleans up after itself.
 */

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
}

async function createContact(
  page: Page,
  fields: { first: string; last: string; email: string; company?: string },
) {
  await page.goto('/contacts/new')
  await page.getByLabel('First name').fill(fields.first)
  await page.getByLabel('Last name').fill(fields.last)
  await page.getByLabel('Email', { exact: false }).first().fill(fields.email)
  if (fields.company) await page.getByLabel('Company').fill(fields.company)
  await page.getByRole('button', { name: 'Create contact' }).click()

  await expect(
    page.getByRole('heading', { level: 1, name: `${fields.first} ${fields.last}` }),
  ).toBeVisible()
}

async function deleteFromDetailPage(page: Page, fullName: string) {
  await page.getByRole('button', { name: `Delete ${fullName}` }).click()
  await page.getByRole('button', { name: `Confirm deleting ${fullName}` }).click()
  await expect(page).toHaveURL(/\/contacts\/?(\?.*)?$/)
}

test.describe('Contacts', () => {
  test('the root path lands on the contacts list', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/contacts\/?$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Contacts' })).toBeVisible()
  })

  test('the list reports a healthy API', async ({ page }) => {
    await page.goto('/contacts')
    await expect(page.getByText(/^api ok/)).toBeVisible()
  })

  test('creates, finds, edits and deletes a contact', async ({ page }) => {
    const email = uniqueEmail('crud')
    const last = `Crud${Date.now().toString().slice(-6)}`

    await createContact(page, {
      first: 'Testy',
      last,
      email,
      company: 'Playwright Inc',
    })
    await expect(page.getByRole('link', { name: email })).toBeVisible()
    await expect(page.getByText('Playwright Inc').first()).toBeVisible()

    // Search narrows the list to the new contact.
    await page.goto('/contacts')
    await page.getByRole('searchbox').fill(last)
    await expect(page).toHaveURL(new RegExp(`q=${last}`))
    await expect(
      page.getByRole('link', { name: `Testy ${last}`, exact: true }),
    ).toBeVisible()

    // Edit it.
    await page.getByRole('link', { name: `Edit Testy ${last}` }).click()
    await page.getByLabel('Job title').fill('Chief Engineer')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Chief Engineer').first()).toBeVisible()

    await deleteFromDetailPage(page, `Testy ${last}`)

    // And it is gone.
    await page.goto(`/contacts?q=${last}`)
    await expect(page.getByRole('heading', { name: 'No matching contacts' })).toBeVisible()
  })

  test('rejects a duplicate email with a field-level error', async ({ page }) => {
    const email = uniqueEmail('dupe')
    const last = `Dupe${Date.now().toString().slice(-6)}`

    await createContact(page, { first: 'First', last, email })

    await page.goto('/contacts/new')
    await page.getByLabel('First name').fill('Second')
    await page.getByLabel('Last name').fill(last)
    await page.getByLabel('Email', { exact: false }).first().fill(email.toUpperCase())
    await page.getByRole('button', { name: 'Create contact' }).click()

    await expect(page.getByText(/already/i).first()).toBeVisible()
    await expect(page).toHaveURL(/\/contacts\/new/)

    await page.goto(`/contacts?q=${last}`)
    await page.getByRole('link', { name: `First ${last}`, exact: true }).click()
    await deleteFromDetailPage(page, `First ${last}`)
  })

  test('validates required fields before calling the API', async ({ page }) => {
    await page.goto('/contacts/new')
    await page.getByLabel('First name').fill('OnlyFirst')
    await page.getByRole('button', { name: 'Create contact' }).click()

    await expect(page.getByText('Please fix the highlighted fields.')).toBeVisible()
    await expect(page.getByText('Last name is required')).toBeVisible()
    await expect(page.getByText('Email is required')).toBeVisible()
  })

  test('sorting is a link and survives a reload', async ({ page }) => {
    await page.goto('/contacts')
    await page.getByRole('columnheader', { name: /email/i }).getByRole('link').click()

    await expect(page).toHaveURL(/sort=email/)
    await expect(page.getByRole('columnheader', { name: /email/i })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )

    await page.reload()
    await expect(page.getByRole('columnheader', { name: /email/i })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
  })

  test('an unknown contact renders the 404 page', async ({ page }) => {
    const response = await page.goto('/contacts/99999999')
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible()
  })

  test('theme toggle switches themes', async ({ page }) => {
    await page.goto('/contacts')
    const html = page.locator('html')
    await expect(html).toHaveAttribute('data-theme', 'dark')

    await page.getByRole('button', { name: /switch to light mode/i }).click()
    await expect(html).toHaveAttribute('data-theme', 'light')
  })

  test('mobile viewport renders the list', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/contacts')
    await expect(page.getByRole('heading', { level: 1, name: 'Contacts' })).toBeVisible()
  })
})
