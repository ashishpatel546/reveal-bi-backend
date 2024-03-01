const express = require('express');
const reveal = require('reveal-sdk-node');
// import reveal from 'reveal-sdk-node'
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const xlsx = require('xlsx');

const csvParser = require('csv-parser');

const { Transform } = require('stream');

function convertXlsxToCsv(xlsxStream) {
  const transformStream = new Transform({
    transform(chunk, encoding, callback) {
      // Parse XLSX data
      const workbook = xlsx.read(chunk);
      const sheet = workbook.Sheets[workbook.SheetNames[1]];
      const csvData = xlsx.utils.sheet_to_csv(sheet);

      // Pass CSV data to the callback
      callback(null, csvData);
    },
  });

  // Pipe XLSX stream through transformation
  xlsxStream.pipe(transformStream);

  // Return the transformed stream
  return transformStream;
}



const app = express();
app.use(cors());

app.get('/dashboards', (req, res) => {
  const directoryPath = './dashboards';
  fs.readdir(directoryPath, (err, files) => {
    if (err) {
      console.error(err);
      res.status(500).send({ error: 'Internal Server Error' });
      return;
    }

    const fileNames = files.map((file) => {
      const { name } = path.parse(file);
      console.log({ name });
      return { name };
    });
    res.json(fileNames);
  });
});

// Step 1 - Set up your Authentication Provider
const authenticationProvider = async (userContext, dataSource) => {
  const userName = process.env['DB_USERNAME_REDSHIFT'];
  const password = process.env['DB_PASSWORD_REDSHIFT'];
  if (dataSource instanceof reveal.RVRedshiftDataSource) {
    return new reveal.RVUsernamePasswordDataSourceCredential(
      userName, // Replace with your actual Redshift username
      password // Replace with your actual Redshift password
      // 'praFep+Uriphaju09epe', // Replace with your actual Redshift password
    );
  }
};

// Step 2 - Set up your Data Source Provider
const dataSourceProvider = async (userContext, dataSource) => {
  if (dataSource instanceof reveal.RVRedshiftDataSource) {
    if (dataSource.id === 'redshift') {
      dataSource.host = process.env['DB_HOST_REDSHIFT'];
      dataSource.port = +process.env['DB_PORT_REDSHIFT'];
      dataSource.database = process.env['DB_NAME_REDSHIFT'];
      dataSource.username = process.env['DB_USERNAME_REDSHIFT'];
      dataSource.password = process.env['DB_PASSWORD_REDSHIFT'];
    }
  }
  return dataSource;
};

// Step 3 - Set up your Data Source Item Provider
const dataSourceItemProvider = async (userContext, dataSourceItem) => {
  // Redshift

  if (dataSourceItem instanceof reveal.RVRedshiftDataSourceItem) {
    dataSourceProvider(userContext, dataSourceItem.dataSource);
    if (dataSourceItem.id === `user1`) {
      console.log(userContext.properties)
      dataSourceItem.customQuery = `SELECT * FROM charging_session where country_code = 'US'`;
    }
    // } else if (dataSourceItem.id === 'charger_uptime_summary') {
    //   dataSourceItem.query = 'SELECT * FROM charger_uptime_summary';
    // } else if (dataSourceItem.id === 'charger_utilization') {
    //   dataSourceItem.query = 'SELECT * FROM charger_utilization';
    // } else if (dataSourceItem.id === 'charging_session') {
    //   dataSourceItem.query = 'SELECT * FROM charging_session';
    // }
  }

  return dataSourceItem;
};

const getLicenceKey = () => {
  const filePath = path.join(process.cwd(), 'licence.key');
  // console.log(filePath)
  try {
    const licence = fs.readFileSync(filePath, 'utf-8');
    // console.log(licence)
    return licence;
  } catch (error) {
    console.err('unable to get licence key!!!');
    return null;
  }
};

const userContextProvider = (request) => {
  // this can be used to store values coming from the request.
  var props = new Map();
  const countries = request.headers.countries
  props.set('countries', countries);
  return new reveal.RVUserContext('user identifier', props);
};

const license = getLicenceKey();
// Step 4 - Set up your Reveal Options
const revealOptions = {
  authenticationProvider: authenticationProvider,
  dataSourceProvider: dataSourceProvider,
  dataSourceItemProvider: dataSourceItemProvider,
  license: license,
  userContextProvider: userContextProvider,
  //localFileStoragePath: "data",
};



app.get('/health-check', (req, res) => {
  console.log('Health check point triggered.');
  res.json({ status: 'ok' });
});

//endpoint to export
app.get('/dashboards/export/:name', async (req, resp) => {
  const name = 'Charging Session'; //req.params.name;
  const format = req.query.format;
  console.log('name: ', name, 'format: ', format);

  const revealServer = new reveal(revealOptions);
  let stream;
  let contentType = 'application/pdf';

  if (format === 'xlsx') {
    contentType =
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    stream = await revealServer.exporter.exportExcel(name, null, null, null);
  } else if (format === 'pptx') {
    contentType =
      'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    stream = await revealServer.exporter.exportPowerPoint(name);
  } else if (format === 'csv') {
    // Set response headers for CSV file download
    resp.setHeader('Content-Type', 'text/csv');
    resp.setHeader(
      'Content-Disposition',
      'attachment; filename="exportedData.csv"'
    );

    const xlsxStream = await revealServer.exporter.exportExcel(name);

    const csv = convertXlsxToCsv(xlsxStream);
    csv.pipe(resp);
    // const csvFilePath = path.join(process.cwd(), 'output.csv');
    // console.log(`Writing file at: ${csvFilePath}`)
    // writeCsvToFile(csv, csvFilePath)
    // .then(filePath => {
    //     console.log(`CSV file written successfully: ${filePath}`);
    // })
    // .catch(error => {
    //     console.error('Error writing CSV file:', error);
    // });
    // resp.sendFile(csvFilePath)

    // const workbook = xlsx.read(xlsxStream, { type: 'buffer' });
    // const sheetName = workbook.SheetNames[0];
    // const worksheet = workbook.Sheets[sheetName];

    // // Convert the worksheet to a CSV stream
    // const csvStream = xlsx.stream.to_csv(worksheet);
    // console.log(`csv stream created`)
    // const exporService = await revealServer.callExportService('xlsx', 'Charging Session')
    // console.log(exporService)
    // console.log('sending response');
    // csvStream.pipe(resp);
  } else {
    stream = await revealServer.exporter.exportPdf(name, null, null, null);
  }

  // resp.json({ status: 'ok' });

  // if (stream) {
  //   resp.setHeader('Content-Type', contentType);
  //   stream.pipe(resp);
  // } else {
  //   resp.sendStatus(404);
  // }
});

// Step 5 - Initialize Reveal with revealOptions
app.use('/', reveal(revealOptions));

// Step 6 - Start your Node Server
const port = process.env.SERVER_PORT;
app.listen(port, () => {
  console.log(`Reveal server accepting http requests on port: ${port}`);
});
