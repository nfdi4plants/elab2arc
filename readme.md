# elab2arc

**elab2arc** is a web-based Single Page Application (SPA) that bridges **eLabFTW** (an electronic lab notebook) and **PLANTdataHUB** (a GitLab-based Annotated Research Context (ARC) repository), enabling seamless synchronization of experimental metadata and raw data into **FAIR-compliant ARCs**.

![ela2arc](https://github.com/user-attachments/assets/5c3ee047-cfc5-4515-84f9-09f77f9cda61)


🔗 **Try it now**: [nfdi4plants.org/elab2arc/](https://nfdi4plants.org/elab2arc/)

---

## 🔍 Overview

Modern microbiological and life sciences research generates vast amounts of both metadata and raw datasets. Managing these across different tools — like ELNs for documentation and Git-based platforms for version control — can lead to fragmentation, manual errors, and poor compliance with FAIR (Findable, Accessible, Interoperable, Reusable) principles.

**elab2arc** automates the transformation of eLabFTW experiments into structured ARCs, ensuring reproducibility, traceability, and long-term data stewardship — all while requiring minimal user input.

---

## 🚀 Key Features

- ✅ **Web-based & Ready-to-use**: No installation needed — just open in your browser.
- 🔗 **Seamless Integration**: Connects **eLabFTW** and **PLANTdataHUB / DataHUB**.
- 📁 **Structured Data Conversion**: Converts experiments into standardized ARC format.
- 🧾 **ISA-Tab Metadata Generation**: Produces compliant metadata sheets for traceability.
- 🌐 **Dynamic URL Rewriting**: Ensures embedded image links work inside the ARC structure.
- 📁 **File Handling**: Manages binary files (images, FASTQs, etc.) and normalizes paths.
- 📥 **Batch Processing**: Select and convert multiple experiments at once.
- 💡 **Client-Side Git Operations**: Uses `isomorphic-git` for full Git functionality without backend dependencies.
- 🖥️ **Offline Filesystem Simulation**: Uses `memfs` for temporary file handling before committing.
- 🔐 **DataHUB Token Login**: Users can now log in via the NFDI4Plants DataHUB and get an access token directly within the app.

---

## 🧩 Built With

- **JavaScript**, **HTML**, **CSS**
- **ARCtrl** – for ISA-Tab metadata handling
- **isomorphic-git** – for client-side Git operations
- **memfs** – for in-memory filesystem simulation
- **turndown** – for HTML-to-Markdown conversion

---

## 📦 How to Use

1. **Open the Tool**: Go to [nfdi4plants.org/elab2arc/](https://nfdi4plants.org/elab2arc/)
2. **Login**:
   - Enter your **eLabFTW API token**
   - Log in to **DataHUB** via the app to get your GitLab personal access token
3. **Select Experiments**:
   - Browse and select one or more experiments from your eLabFTW instance
4. **Transform to ARC**:
   - Let elab2arc automatically structure your metadata and files into a FAIR-compliant ARC
5. **Commit & Push**:
   - Review changes and push directly to your GitLab repository

---

## 📄 License

This project is licensed under the **GNU General Public License v3.0** – see the [LICENSE](LICENSE) file for details.

---


## 📬 Contact

For questions, bug reports, or feature requests, please [open an issue](https://github.com/nfdi4plants/elab2arc/issues) on GitHub or reach out via [nfdi4plants.org](https://nfdi4plants.org).

---

## 🚀 Future Improvements

- Integration with other ELNs and RDM tools
- LLM-assisted metadata structuring (e.g., ChatGPT, Qwen)
- Support for RO-Crate and .ELN import/export formats
- Enhanced user authentication and error handling

---

**elab2arc** empowers researchers to streamline their workflows while adhering to modern data management standards. Start converting your experiments into FAIR-compliant ARCs today using the hosted version at [nfdi4plants.org/elab2arc/](https://nfdi4plants.org/elab2arc/)!
