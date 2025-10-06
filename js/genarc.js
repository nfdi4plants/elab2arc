

function uniqueByContent(arr) {
  const seen = new Set();
  return arr.filter(item => {
    const key = JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

BVconvert = async function () {
    var mmm = []
    var nnn = [

    ]

var newStudies = [];
for (ele of [... new Set(mmm)]){
    let indexes = [];
    let idx = mmm.indexOf(ele);    
    while (idx !== -1) {
      indexes.push(idx);
      idx = mmm.indexOf(ele, idx + 1);
}
     newStudies.push({"name": ele ,"list":indexes})
}

    let invContacts = [];
    const response = await fetch("templates/20250821_030306_isa.assay.xlsx")
    const template_arrayBuffer = await response.arrayBuffer();
    const template_ut8 = new Uint8Array(template_arrayBuffer);
    fs.writeFileSync('template.xlsx', template_ut8);
    const assay1 = await Xlsx.fromXlsxFile("/template.xlsx");
    const inv1 = arctrl.ArcInvestigation.init("123");
        inv1.Description = ""
          inv1.Title = ""
    const files = document.getElementById("import").files;
    for (const [index, StudieGroup] of Object.entries(newStudies)) {

        
        


        
        const studyName = StudieGroup.name;
        // const study = await inv1.InitStudy(studyName);
        // study.Title = studyName;
        // study.Description = studyName;
        // study.InitTable("Study source to sample mapping", 0);
        // //
        // console.log("start " + studyName);



        // const studyTable = study.Tables[0];

        // const oa_locationame = new arctrl.OntologyAnnotation("Location", "NCIT", "NCIT:C25341");
        // const oa_date = new arctrl.OntologyAnnotation("Collection Date", "NCIT", "NCIT:C81286");


        // studyTable.AddColumn(arctrl.CompositeHeader.input(arctrl.IOType.source()), []);
        // studyTable.AddColumn(arctrl.CompositeHeader.characteristic(oa_locationame), []);
        // //studyTable.AddColumn(arctrl.CompositeHeader.characteristic(oa_date), []);
        // studyTable.AddColumn(arctrl.CompositeHeader.output(arctrl.IOType.sample()), []);


      
        let studyContacts = [];
        for (const [index1, assay] of Object.entries(StudieGroup.list)) {
            
            const template1 = arctrl.XlsxController.Assay.fromFsWorkbook(assay1);
            console.log(assay)
            console.log(files[assay].name)
            const file = files[assay];
            const assayName = file.name.replace(".xlsx", "").replace(/[^a-zA-Z0-9_\-]/g, "_");
            const bv_arrayBuffer = await file.arrayBuffer();
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(bv_arrayBuffer);
            const metadataSheet = workbook.getWorksheet('METADATA');
            const phenotypes = workbook.getWorksheet('PHENOTYPES');
            const dataSheet = workbook.getWorksheet('DATA');
            const locationColumnNr = dataSheet.getRow(1).values.indexOf("Location");
            const locationCharacter = String.fromCharCode(64 + locationColumnNr);
            const dataLocationList = dataSheet.getColumn(locationCharacter).values.slice(2);
            const dataSourceList = dataSheet.getColumn("A").values.slice(2);
             
            

   
           
        //     template1.Identifier = assayName;
        //     const PhenoMeasure = new arctrl.OntologyAnnotation("phenotype", "UPHENO", "UPHENO:0001001");
        //     template1.MeasurementType = PhenoMeasure;
        //     assayTable = template1.tables[0];
        //     assayTable.Name = "Phenotype Table";

        //     for (const[dataIndex, dataEle ] of Object.entries(dataSourceList)){
        //     const license =  metadataSheet.getColumn("C").values[4];
        //     const value_license = new arctrl.OntologyAnnotation(license, "", "");
        //     //const value_date = new arctrl.OntologyAnnotation(date, "", "");
        //     const value_locationame = new arctrl.OntologyAnnotation(dataLocationList[dataIndex], "", "");
        //     studyTable.AddRow([
        //         arctrl.CompositeCell.createFreeText(dataEle+"_"+dataIndex+"_"+assayName),
        //         arctrl.CompositeCell.createTerm(value_locationame),
        //         //arctrl.CompositeCell.createTerm(value_date),
        //         arctrl.CompositeCell.createFreeText(assayName+"/"+dataEle+"_"+dataIndex)]);
                
        //         assayTable.AddRow([
        //         arctrl.CompositeCell.createFreeText(assayName+"/"+dataEle+"_"+dataIndex),
        //         arctrl.CompositeCell.createTerm(value_license),
        //         arctrl.CompositeCell.createFreeText( "./dataset/"+assayName + "-output.csv")]); 
        //             const output_ut8 = new Uint8Array(bv_arrayBuffer);
   
        // }
            const collaborators = workbook.getWorksheet('COLLABORATORS');
            let collaboratorList = [];
            const collaborators_last_name = await collaborators.getColumn("B").values.slice(3);
            const collaborators_first_name = await collaborators.getColumn("A").values.slice(3);
            const collaborators_role = await collaborators.getColumn("C").values.slice(3);
            const collaborators_id = await collaborators.getColumn("D").values.slice(3);
            const collaborators_email = await collaborators.getColumn("E").values.slice(3);
            const collaborators_phone = await collaborators.getColumn("F").values.slice(3);
            const collaborators_affiliation = await collaborators.getColumn("G").values.slice(3);
            const collaborators_address = await collaborators.getColumn("H").values.slice(3);
            for (const [i, ele] of Object.entries(collaborators_last_name)) {
                ele ??= " ";
                collaborators_first_name[i] ??= " ";
                collaborators_role[i] ??= " ";
                collaborators_email[i] ??= " ";
                collaborators_affiliation[i] ??= " ";
                collaborators_id[i] ??= " ";
                collaborators_phone[i] ??= " ";
                collaborators_address[i] ??= " ";
                const roles = new arctrl.OntologyAnnotation(collaborators_role[i], " ", "");
                const empty = new arctrl.OntologyAnnotation(" ", " ", "");
                let comments_p = arctrl.Comment$.create(" ", " ");
                const firstName = collaborators_first_name[i];
                const familyName = ele;
                const email = collaborators_email[i];
                const affiliation = collaborators_affiliation[i];
                const id = collaborators_id[i];
                const phone = collaborators_phone[i];
                const address = collaborators_address[i];
                const person = arctrl.Person.create(JSON.stringify(id), firstName, familyName, void 0, JSON.stringify(email?.text? email.text: email), phone, void 0, address, affiliation, [roles], [comments_p]);
                const person_inv = arctrl.Person.create(JSON.stringify(id), firstName, familyName, void 0, JSON.stringify(email?.text? email.text: email), void 0, void 0, void 0, affiliation, [empty], [comments_p]);
                template1.Performers.push(person);
                studyContacts.push(person);
                invContacts.push(person_inv);
                collaboratorList.push(firstName + " " + familyName);
                //console.log(collaboratorList)
            }

            
            // const workbook2 = new ExcelJS.Workbook();
            // const worksheet2 = workbook2.addWorksheet("Sheet 1");
            // dataSheet.eachRow(row => worksheet2.addRow(row));
            const assayCsv = await dataSheet._workbook.csv.writeBuffer({sheetName: "DATA"});
          const dataHeader = dataSheet.getRow(1).values;
            const phenotypeRow = phenotypes.getColumn("A").values;
            const commonHeaders = dataHeader.filter(value => phenotypeRow.includes(value));
            const dataOnlyHeader = dataHeader.filter(value => !phenotypeRow.includes(value));
            const dataonlyList = ["Line/Phenotype", "Rep", "Block", "Row", "Column", "Treatment", "Location", "Latitude", "Longitude", "Elevation"];
            //const dataonlyLast = dataOnlyHeader.filter(item => !dataonlyList.includes(item));

            //console.log("data only headers: " + dataOnlyHeader)

              // Create workbook and worksheet
            //const workbook2 = new ExcelJS.Workbook();
            //const worksheet = workbook2.addWorksheet("isa_datamap");
            
            // Header row
           const response1 = await fetch("templates/isa.datamap.xlsx")
            const template_arrayBuffer1 = await response1.arrayBuffer();
             const datamapworkbook = new ExcelJS.Workbook();
            await datamapworkbook.xlsx.load(template_arrayBuffer1)

            const datamaptable =datamapworkbook.getWorksheet("isa_datamap");
            
            // First row: sample name
            datamaptable.addRow([
                `"/git/assays/${assayName}/dataset/${assayName}-output.csv#col=1"`,
                "text/csv",
                "https://datatracker.ietf.org/doc/html/rfc7111",
                "Sample Name",
                "DPBO",
                "DPBO:0000180",
                " ",
                " ",
                " ",
                "text",
                " ",
                " ",
                "Samples are a kind of material and represent major outputs resulting from a protocol application.",
                `"${collaboratorList}"`
            ]);

            // Loop over phenotype headers

            // Save file
            
            


            let Header = "Data, Data Format, Data Selector Format, Explication, Term Source REF, Term Accession Number, Unit, Term Source REF, Term Accession Number, Object Type, Term Source REF, Term Accession Number, Description, Generated By \n";
            const c1 = "\"/git/assays/" + assayName + "/dataset/" + assayName + "-output.csv#col=1\"";
                const c2 = "text/csv";
                const c3 = "https://datatracker.ietf.org/doc/html/rfc7111";
                const createdBy = "\"" + collaboratorList + "\"";
                Header += c1 + "," + c2 + "," + c3 + "," + "Sample Name" + "," + "DPBO" + "," + "DPBO:0000180" + "," + " " + "," + " " + "," + " " + "," + "text" + "," + " " + "," + " " + "," + "Samples are a kind of material and represent major outputs resulting from a protocol application." + "," + createdBy + "\n";


            for (const [index, ele] of Object.entries(commonHeaders)) {

                const c1 = "\"/git/assays/" + assayName + "/dataset/" + assayName + "-output.csv#col=" + dataHeader.indexOf(ele) + "\"";
                const c2 = "text/csv";
                const c3 = "https://datatracker.ietf.org/doc/html/rfc7111";
                const c4 = "\"" + ele + "\"";
                const phenotypeIndex = phenotypeRow.indexOf(ele);
                const unit = `"${phenotypes.getColumn("E").values[phenotypeIndex]}"`;
                const type = `"${phenotypes.getColumn("D").values[phenotypeIndex]}"`;
                const description = `"${phenotypes.getColumn("C").values[phenotypeIndex]}"`;
                const createdBy = "\"" + collaboratorList + "\"";
                Header += c1 + "," + c2 + "," + c3 + "," + c4 + "," + " " + "," + " " + "," + unit + "," + " " + "," + " " + "," + type + "," + " " + "," + " " + "," + description + "," + createdBy + "\n";

                const colIndex = dataHeader.indexOf(ele);


                datamaptable.addRow([
                `"git/assays/${assayName}/dataset/${assayName}-output.csv#col=${colIndex}"`,
                "text/csv",
                "https://datatracker.ietf.org/doc/html/rfc7111",
                `"${ele}"`,
                " ",
                " ",
                unit,
                " ",
                " ",
                type,
                " ",
                " ",
                description,
                `"${collaboratorList}"`
                ]);
            
            
}

            // worksheet.addTable({
            // name: 'DataMapTable',
            // ref: 'A1',
            // headerRow: true,
            // totalsRow: false,
            // style: {
            //     theme: 'TableStyleMedium9',
            //     showRowStripes: true,
            // },
            // columns: datamapCol,
            // rows: datamapRow, // data rows only
            // })
            fs.writeFileSync("git/assays/" + assayName + "/isa.datamap.csv", Header);
            const datamapxlsx = await datamapworkbook.xlsx.writeBuffer();
            fs.writeFileSync("git/assays/" + assayName + "/isa.datamap.xlsx", datamapxlsx);

            // const inputText = String(workbook.getWorksheet('DATA').getColumn("A").values.slice(2)).replaceAll(",", "\n");
            // //fs.writeFileSync("git/assays/" + assayName + "/dataset/" + assayName + "-sample.csv", "sample\n" + inputText);
            
            // inv1.AddAssay(template1);
            // inv1.RegisterAssay( studyName,assayName);

            // const xlsxObject1 = await arctrl.XlsxController.Assay.toFsWorkbook(template1);
            // //let xlsxBuffer = await Xlsx.toXlsxBytes(xlsxObject);
            // await Xlsx.toFile("git/assays/" + assayName + "/isa.assay.xlsx", xlsxObject1);
  

        }
        // study.Contacts = uniqueByContent(studyContacts); 
        // const xlsxObject2 = await arctrl.XlsxController.Study.toFsWorkbook(study);
        //     //let xlsxBuffer = await Xlsx.toXlsxBytes(xlsxObject);
        // await Xlsx.toFile("git/studies/" + studyName + "/isa.study.xlsx", xlsxObject2);


        // //inv1.AddStudy(study);
        // inv1.RegisterStudy(studyName);
        // fs.writeFileSync("git/studies/" + studyName + "/resources/" + studyName + "_" + index1 + "_source.csv", String(sourceList[index1]).replaceAll(",", "\n"))


        

        //savedData(xlsxBuffer, "report.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

        console.log("done " + studyName)
    }

        //inv1.Contacts = uniqueByContent(invContacts);
        //const xlsxObject3 = await arctrl.XlsxController.Investigation.toFsWorkbook(inv1);
        //let xlsxBuffer = await Xlsx.toXlsxBytes(xlsxObject);
        //await Xlsx.toFile("git/isa.investigation1.xlsx", xlsxObject3);
    console.log("finished")
}

