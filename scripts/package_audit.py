import os
import zipfile

src_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'artifacts', 'ui-audit'))
zip_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'artifacts', 'ui-audit-review.zip'))

print(f"Packaging from: {src_dir}")
print(f"Packaging to:   {zip_path}")

allowed_reports = {
    'screenshot-manifest.json',
    'page-inventory.md',
    'ui-findings.md',
    'workflow-results.md',
    'README.md',
}

included_files = []
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(src_dir):
        for file in files:
            if file.endswith('.png') or file in allowed_reports:
                full_path = os.path.join(root, file)
                arcname = os.path.relpath(full_path, src_dir)
                zipf.write(full_path, arcname)
                included_files.append(arcname)

# Verification
print(f"\nVerifying created archive: {zip_path}")
with zipfile.ZipFile(zip_path, 'r') as verify_zip:
    namelist = verify_zip.namelist()
    test_result = verify_zip.testzip()
    png_list = [n for n in namelist if n.endswith('.png')]
    report_list = [n for n in namelist if not n.endswith('.png')]

    print(f"Integrity check: {'PASSED (no corruption)' if test_result is None else f'FAILED: {test_result}'}")
    print(f"Total entries in ZIP: {len(namelist)}")
    print(f"PNG screenshots count: {len(png_list)}")
    print(f"Report files included: {len(report_list)}")
    for r in sorted(report_list):
        print(f"  - {r}")

    # Check size
    size_mb = os.path.getsize(zip_path) / (1024 * 1024)
    print(f"Archive file size: {size_mb:.2f} MB")
